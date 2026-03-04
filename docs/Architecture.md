# Architecture

## System Overview

The Pagani Zonda R Enterprise Intelligence system is a full-stack AI application with role-based access control and RAG-powered chat.

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│               Next.js + React + TypeScript       │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Ignition │  │  Auth    │  │   Chat        │  │
│  │Experience│  │  Pages   │  │   Assistant   │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│         │            │              │            │
│         └────────────┼──────────────┘            │
│                      │                           │
│              lib/api.ts (fetch wrapper)          │
└──────────────────────┼───────────────────────────┘
                       │ HTTP/SSE
┌──────────────────────┼───────────────────────────┐
│                   Backend                        │
│              FastAPI + Python                    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │   Auth   │  │   Chat   │  │    Health     │  │
│  │  (JWT)   │  │ Endpoints│  │   Monitor    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│         │            │              │            │
│  ┌──────┴────────────┴──────────────┴──────────┐ │
│  │           RAG Pipeline (Gemini LLM)         │ │
│  │  Agentic Router → Vector Search → Generate  │ │
│  └─────────────────────┬───────────────────────┘ │
│                        │                         │
│  ┌─────────────┐  ┌───┴─────────┐  ┌─────────┐  │
│  │  SQLAlchemy │  │   FAISS     │  │ Gemini  │  │
│  │  Database   │  │ VectorStore │  │   API   │  │
│  └─────────────┘  └─────────────┘  └─────────┘  │
└──────────────────────────────────────────────────┘
```

## Frontend

- **Framework**: Next.js 16 with React 19 and TypeScript
- **Styling**: TailwindCSS 4 with custom Pagani design tokens
- **Animation**: Framer Motion for page transitions and UI interactions
- **State**: React hooks (useState, useEffect, useCallback)
- **Auth**: JWT tokens stored in localStorage with auto-refresh

### Key Components

| Component | Purpose |
|-----------|---------|
| `IgnitionExperience` | Cinematic intro with video playback |
| `Navbar` | Navigation with auth state, role display |
| `ChatAssistant` | RAG-powered AI chat with streaming |
| `ZondaScrollCanvas` | Scroll-driven image sequence animation |
| `ZondaExperience` | HUD overlay for scroll experience |

## Backend

- **Framework**: FastAPI with Pydantic validation
- **Auth**: JWT (access + refresh tokens) via python-jose
- **Database**: SQLAlchemy ORM (PostgreSQL/SQLite)
- **Vector Store**: FAISS with Gemini embeddings
- **LLM**: Google Gemini API
- **Rate Limiting**: slowapi
- **Security**: Custom middleware (headers, request size limits)

### RAG Pipeline

1. **Agentic Router**: Decides if vector search is needed; reformulates queries using chat history
2. **Hybrid Search**: FAISS semantic search + keyword search with Reciprocal Rank Fusion
3. **Role-Based Filtering**: Documents filtered by user role (admin/engineer/viewer)
4. **Response Generation**: Gemini generates response with context + system prompt

### Authentication Flow

1. User registers → password hashed with bcrypt → stored in memory + DB
2. User logs in → JWT access token (30min) + refresh token (7 days) issued
3. API requests include Bearer token → verified via `get_current_user` dependency
4. On 401 → frontend auto-refreshes token and retries

## Data Flow

```
User Input → sanitizeInput() → API fetch → FastAPI endpoint
    → Agentic Router (needs search?)
    → FAISS Hybrid Search (semantic + keyword, role-filtered)
    → Gemini Generation (with context + history)
    → Response → DB persistence (ChatHistory)
    → SSE stream to frontend → Markdown rendering
```
