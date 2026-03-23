"""
Pagani Zonda R – Document Management System
Upload, chunk, tag, version, and manage enterprise documents.
"""

import os
import uuid
import shutil
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import UploadFile

logger = logging.getLogger("pagani.documents")

# ── Upload directory ──
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


async def upload_document(
    file: UploadFile,
    uploaded_by: str,
    tags: Optional[list[str]] = None,
    title: Optional[str] = None,
) -> dict:
    """
    Upload a document, persist to disk and DB, then chunk for RAG ingestion.
    Returns document metadata.
    """
    from error_handlers import DocumentProcessingError, ValidationError

    # Validate extension
    _name = file.filename or "unnamed"
    ext = os.path.splitext(_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            message=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            details={"filename": _name},
        )

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValidationError(
            message=f"File too large ({len(content)} bytes). Max: {MAX_FILE_SIZE} bytes.",
        )

    # Generate unique ID and save
    doc_id = str(uuid.uuid4())
    save_filename = f"{doc_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_filename)

    try:
        with open(save_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise DocumentProcessingError(
            message=f"Failed to save file: {e}",
            details={"filename": _name},
        )

    # Persist metadata to DB
    doc_record = _save_document_to_db(
        doc_id=doc_id,
        filename=_name,
        file_type=ext,
        file_size=len(content),
        uploaded_by=uploaded_by,
        save_path=save_path,
        tags=tags,
        title=title or os.path.splitext(_name)[0],
    )

    # Auto-chunk the document
    chunk_count = 0
    try:
        chunk_count = _auto_chunk_document(doc_id, save_path, ext, _name)
    except Exception as e:
        logger.warning(f"Auto-chunking failed for {_name}: {e}")

    logger.info(f"Document uploaded: {_name} (id={doc_id}, chunks={chunk_count})")
    return {
        "id": doc_id,
        "filename": _name,
        "file_type": ext,
        "file_size": len(content),
        "uploaded_by": uploaded_by,
        "chunk_count": chunk_count,
        "tags": tags or [],
        "title": title or os.path.splitext(_name)[0],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _save_document_to_db(
    doc_id: str,
    filename: str,
    file_type: str,
    file_size: int,
    uploaded_by: str,
    save_path: str,
    tags: Optional[list[str]],
    title: str,
) -> dict:
    """Persist document record to the database."""
    try:
        from database import get_db_session
        from models import Document
        with get_db_session() as db:
            doc = Document(
                id=doc_id,
                filename=filename,
                file_type=file_type,
                file_size=file_size,
                uploaded_by=uploaded_by,
                file_path=save_path,
                title=title,
                tags=tags or [],
                version=1,
            )
            db.add(doc)
        return {"id": doc_id}
    except Exception as e:
        logger.error(f"Failed to persist document to DB: {e}")
        return {"id": doc_id, "db_error": str(e)}


def _auto_chunk_document(doc_id: str, file_path: str, ext: str, filename: str) -> int:
    """Chunk a document and ingest into the vector store."""
    from vector_store import vector_store

    text_content = ""

    if ext == ".pdf":
        try:
            import fitz
            doc = fitz.open(file_path)
            for page in doc:
                text_content += page.get_text() + "\n\n"
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {e}")
            return 0

    elif ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text_content = f.read()

    elif ext == ".docx":
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(file_path) as z:
                with z.open("word/document.xml") as f:
                    tree = ET.parse(f)
                    root = tree.getroot()
                    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                    paragraphs = root.findall(".//w:p", ns)
                    text_content = "\n".join(
                        "".join(node.text or "" for node in p.findall(".//w:t", ns))
                        for p in paragraphs
                    )
        except Exception as e:
            logger.warning(f"DOCX text extraction failed: {e}")
            return 0

    if not text_content.strip():
        return 0

    # Chunk using simple sliding window
    chunks = _chunk_text(text_content, chunk_size=1000, overlap=200)

    # Build document chunks for ingestion
    chunk_dicts = []
    for i, chunk in enumerate(chunks):
        chunk_dicts.append({
            "content": chunk,
            "source": filename,
            "chunk_id": f"{doc_id}_chunk_{i}",
            "role_access": ["admin", "engineer", "viewer"],
            "is_pdf": True,
            "document_id": doc_id,
        })

    # Ingest into vector store
    if chunk_dicts:
        vector_store.ingest_pdf_chunks(chunk_dicts)

    return len(chunk_dicts)


def _chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - overlap
    return chunks


def list_documents(limit: int = 100, offset: int = 0) -> list[dict]:
    """List all uploaded documents from DB."""
    try:
        from database import get_db_session
        from models import Document
        with get_db_session() as db:
            docs = db.query(Document).order_by(
                Document.created_at.desc()
            ).offset(offset).limit(limit).all()
            return [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "file_type": d.file_type,
                    "file_size": d.file_size,
                    "uploaded_by": d.uploaded_by,
                    "title": d.title,
                    "tags": d.tags or [],
                    "version": d.version,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in docs
            ]
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        return []


def get_document(doc_id: str) -> dict | None:
    """Get a single document by ID."""
    try:
        from database import get_db_session
        from models import Document
        with get_db_session() as db:
            d = db.query(Document).filter(Document.id == doc_id).first()
            if not d:
                return None
            return {
                "id": d.id,
                "filename": d.filename,
                "file_type": d.file_type,
                "file_size": d.file_size,
                "uploaded_by": d.uploaded_by,
                "title": d.title,
                "tags": d.tags or [],
                "version": d.version,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        return None


def delete_document(doc_id: str) -> bool:
    """Delete a document by ID, including its file on disk."""
    try:
        from database import get_db_session
        from models import Document
        with get_db_session() as db:
            d = db.query(Document).filter(Document.id == doc_id).first()
            if not d:
                return False
            # Remove file from disk
            if d.file_path and os.path.exists(d.file_path):
                os.remove(d.file_path)
            db.delete(d)
        logger.info(f"Document deleted: {doc_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete document: {e}")
        return False


def update_document_metadata(doc_id: str, title: str | None = None, tags: list[str] | None = None) -> dict | None:
    """Update document metadata (title, tags)."""
    try:
        from database import get_db_session
        from models import Document
        with get_db_session() as db:
            d = db.query(Document).filter(Document.id == doc_id).first()
            if not d:
                return None
            if title is not None:
                d.title = title
            if tags is not None:
                d.tags = tags
            db.flush()
            return {
                "id": d.id,
                "title": d.title,
                "tags": d.tags or [],
                "updated": True,
            }
    except Exception as e:
        logger.error(f"Failed to update document metadata: {e}")
        return None
