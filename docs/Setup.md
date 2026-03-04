# Setup Guide

## Prerequisites

- Node.js 18+
- Python 3.11+
- Git
- (Optional) PostgreSQL 16+ or Docker

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Nischal-S143/EnterpriseRAG.git
cd EnterpriseRAG
```

### 2. Frontend Setup

```bash
npm install
```

Create `.env.local` in the root:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEBUG_LOG=false
```

### 3. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Create `.env` in the `/backend` directory:

```env
GEMINI_API_KEY=your-gemini-api-key
JWT_SECRET_KEY=your-secret-key
JWT_REFRESH_SECRET_KEY=your-refresh-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=sqlite:///pagani.db
LOG_LEVEL=INFO
```

### 4. Database Setup

**SQLite (default)**: No setup needed. The database file `pagani.db` is created automatically on first run.

**PostgreSQL**:

```bash
# Using Docker
docker run -d --name pagani-db \
  -e POSTGRES_USER=pagani \
  -e POSTGRES_PASSWORD=pagani_secret \
  -e POSTGRES_DB=pagani \
  -p 5432:5432 postgres:16-alpine
```

Then update `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgresql://pagani:pagani_secret@localhost:5432/pagani
```

### 5. Running the Project

**Backend** (terminal 1):

```bash
cd backend
python main.py
```

The API will start on `http://localhost:8000`.

**Frontend** (terminal 2):

```bash
npm run dev
```

The frontend will start on `http://localhost:3000`.

### 6. Using Docker Compose

```bash
# Set your Gemini API key
export GEMINI_API_KEY=your-key-here

# Start all services
docker-compose up -d
```

This starts PostgreSQL, the backend, and frontend together.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `JWT_SECRET_KEY` | Yes | `pagani-default-secret` | JWT signing secret |
| `JWT_REFRESH_SECRET_KEY` | Yes | `pagani-refresh-secret` | Refresh token secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Refresh token lifetime |
| `DATABASE_URL` | No | `sqlite:///pagani.db` | Database connection URL |
| `LOG_LEVEL` | No | `INFO` | Logging level |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | Backend API URL |
| `NEXT_PUBLIC_DEBUG_LOG` | No | `false` | Enable frontend debug logs |

## Running Tests

**Backend**:

```bash
cd backend
python -m pytest tests/ -v
```

**Frontend** (when Jest is configured):

```bash
npm test
```
