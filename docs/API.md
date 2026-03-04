# API Documentation

Base URL: `http://localhost:8000`

## Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

---

## Endpoints

### POST `/api/register`

Register a new user account.

**Rate Limit**: 10/minute

**Request Body**:
```json
{
  "username": "string (3-50 chars)",
  "password": "string (6-128 chars)",
  "role": "viewer | engineer | admin"
}
```

**Response** `201`:
```json
{
  "message": "User registered successfully",
  "username": "string",
  "role": "string"
}
```

**Errors**: `409` (duplicate), `400` (invalid role), `422` (validation)

---

### POST `/api/login`

Authenticate and receive JWT tokens.

**Rate Limit**: 5/minute

**Request Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response** `200`:
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "bearer",
  "expires_in": 1800,
  "role": "string",
  "username": "string"
}
```

**Errors**: `401` (invalid credentials)

---

### POST `/api/refresh`

Exchange a refresh token for new access + refresh tokens.

**Rate Limit**: 10/minute

**Request Body**:
```json
{
  "refresh_token": "string"
}
```

**Response**: Same format as `/api/login`

---

### GET `/api/me`

Get current authenticated user info.

**Auth Required**: Yes

**Response** `200`:
```json
{
  "username": "string",
  "role": "string",
  "created_at": "ISO 8601 timestamp"
}
```

---

### POST `/api/chat`

RAG-powered chat with the AI assistant.

**Auth Required**: Yes | **Rate Limit**: 20/minute

**Request Body**:
```json
{
  "question": "string (1-2000 chars)"
}
```

**Response** `200`:
```json
{
  "answer": "string",
  "sources": ["string"],
  "confidence": "high | medium | low",
  "user_role": "string"
}
```

**Errors**: `503` (AI unavailable), `500` (internal error)

---

### POST `/api/chat/stream`

Streaming version of chat endpoint. Returns Server-Sent Events.

**Auth Required**: Yes | **Rate Limit**: 20/minute

**Request Body**: Same as `/api/chat`

**Response**: `text/event-stream`
```
data: <token chunk>

data: [DONE]
```

---

### GET `/api/health`

System health check (no auth required).

**Response** `200`:
```json
{
  "status": "healthy | degraded",
  "database": "connected | disconnected",
  "ai_service": "available | unavailable",
  "uptime": "string (e.g. '3600s')",
  "timestamp": "ISO 8601 timestamp",
  "vector_store_initialized": true,
  "registered_users": 0
}
```
