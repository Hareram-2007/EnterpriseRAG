# Pagani Zonda R – Enterprise Intelligence RAG Agent

A cinematic scrollytelling luxury automotive experience integrated with a highly secure, role-based **Enterprise Retrieval-Augmented Generation (RAG) System** powered by Google Gemini 1.5 Pro.

## 🏎️ Overview

This project showcases the intersection of ultra-premium frontend design and secure, enterprise-grade AI architecture. 

While the frontend delivers a stunning 240-frame scroll-controlled 3D sequence of the Pagani Zonda R, the true powerhouse of the application is the **Enterprise RAG Agent**. Users authenticate into the system via JWT and are routed to role-specific experiences (Viewer, Engineer, Admin). The AI Assistant securely queries a persistent FAISS vector store, dynamically filtering internal technical documents, telemetry, and financial data based strictly on the user's authenticated role.

## 🏗️ Architecture

```
Frontend (Next.js 16 + Tailwind v4)       Backend (FastAPI + Gemini)
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  Role-Based Next.js Routing  │          │  /api/register  (POST)      │
│  Viewer Scroll Canvas        │   REST   │  /api/login     (POST)      │
│  Engineer Dashboard          │ ◄──────► │  /api/refresh   (POST)      │
│  Admin Analytics Dashboard   │          │  /api/chat      (POST)      │
│  Global RAG ChatAssistant    │          │  /api/chat/stream (POST)    │
└──────────────────────────────┘          │  /api/me        (GET)       │
                                          └──────────┬───────────────────┘
                                                     │
                                          ┌──────────▼───────────────────┐
                                          │  Agentic Query Router        │
                                          │  Session Memory Map          │
                                          └──────────┬───────────────────┘
                                                     │
                                          ┌──────────▼───────────────────┐
                                          │  Hybrid Search Engine        │
                                          │  - FAISS Vector Embeddings   │
                                          │  - Keyword TF Scoring        │
                                          │  - Reciprocal Rank Fusion    │
                                          │  Runtime Role Access Filter  │
                                          └──────────┬───────────────────┘
                                                     │
                                          ┌──────────▼───────────────────┐
                                          │  Gemini 2.5 Flash (LLM)      │
                                          │  Strict Context Grounding    │
                                          │  Streaming + Attribution     │
                                          └──────────────────────────────┘
```

## ✨ Core Features

### 🧠 Enterprise RAG Agent
- **Agentic Routing:** Gemini 2.5 Flash actively decides whether to formulate search queries or answer conversationally, saving DB compute.
- **Conversational Memory:** Contextual session storage mapping user JWTs to rolling chat histories for intelligent follow-ups.
- **Hybrid Search (RRF):** FAISS semantic embeddings combined with Term Frequency (TF) keyword matching via Reciprocal Rank Fusion for pinpoint specification retrieval.
- **Strict Role-Based Access Control (RBAC):** RAG context generation is strictly filtered by JWT claims. Viewers cannot retrieve engineering telemetry.
- **Zero Hallucination Tolerance:** The system prompt forces answers *only* from retrieved enterprise context.
- **Streaming Responses:** Real-time token-by-token generation via Server-Sent Events (SSE).

### 🛡️ Dynamic Authentication & Routing
- **Ignition Flow:** Users are greeted with an immersive video sequence before entering the secure login portal.
- **Next.js Conditional Rendering:** Eradicates layout flicker. Unauthenticated users see the portal; authenticated users are instantly routed to their authorized dashboards via `useRouter`.
- **JWT Security:** Access and refresh token rotation, bcrypt hashing, and API rate limiting via `slowapi`.

### 🏎️ Viewer Experience
- **Cinematic WebGL-style Canvas:** 240 high-resolution frames of the Zonda R manipulated by Framer Motion's `useScroll` hook.
- **HUD Telemetry Overlay:** Parallax data points fading in through Hero, Design, and Engine phases.

### ⚙️ Executive Dashboards
- **Engineer Dashboard:** A complex data interface displaying mock telemetry, aerodynamic testing data (Dallara wind tunnel), and component lifecycle tracking.
- **Admin Dashboard:** An executive SaaS-style interface managing user access logs, global system health, and high-level vehicle financial data.

## 📁 Project Structure

```
pagani/
├── app/
│   ├── layout.tsx              # Root layout with Orbitron + Rajdhani fonts
│   ├── page.tsx                # Main page with scroll sequence + ChatAssistant
│   ├── globals.css             # Tailwind v4 @theme + custom scrollbar
│   ├── login/page.tsx          # Premium login page
│   └── register/page.tsx       # Registration with role selection
├── components/
│   ├── Navbar.tsx              # Glassmorphism navbar with auth state
│   ├── ZondaScrollCanvas.tsx   # 240-frame canvas renderer
│   ├── ZondaExperience.tsx     # HUD overlay with scroll phases
│   └── ChatAssistant.tsx       # AI assistant with streaming
├── lib/
│   ├── api.ts                  # Centralized fetch with 401 auto-refresh
│   └── auth.ts                 # Login/register/logout utilities
├── data/
│   └── carData.ts              # Car specification data
├── backend/
│   ├── main.py                 # FastAPI app (6 endpoints, rate limiting, CORS)
│   ├── auth.py                 # JWT auth + refresh tokens + RBAC + Pydantic models
│   ├── vector_store.py         # FAISS + Gemini embeddings + persistence
│   ├── rag_pipeline.py         # Gemini 2.0 Flash generation + streaming
│   └── requirements.txt        # Python dependencies
├── public/images/zonda-sequence/  # 240 car images (1.jpg - 240.jpg)
├── .env.local                  # NEXT_PUBLIC_API_URL
└── next.config.ts              # API proxy to FastAPI backend
```

## 🚀 Setup & Run

### Prerequisites
- Node.js 18+
- Python 3.10+
- Google Gemini API key

### 1. Clone & Install Frontend
```bash
git clone https://github.com/Nischal-S143/EnterpriseRAG.git
cd EnterpriseRAG
npm install
```

### 2. Install Backend
```bash
cd backend
pip install -r requirements.txt
```

### 3. Configure Environment

**Backend** – Create `backend/.env`:
```
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET_KEY=your_jwt_secret
JWT_REFRESH_SECRET_KEY=your_refresh_secret
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

**Frontend** – Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Run Backend
```bash
cd backend
python main.py
# → http://localhost:8000
```

### 5. Run Frontend
```bash
npm run dev
# → http://localhost:3000
```

### 6. Usage
1. Open `http://localhost:3000`
2. Register at `/register` (choose Viewer/Engineer/Admin role)
3. Login at `/login`
4. Click **INQUIRE** → ask about the Zonda R
5. Try different roles to see RBAC in action

## 🔐 RBAC Document Access

| Role | Documents |
|---|---|
| **Viewer** | Heritage, engine specs, performance, interior, production, exhaust |
| **Engineer** | All Viewer docs + aerodynamics, brakes, suspension, tires |
| **Admin** | All docs + financial & ownership data |

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4, Framer Motion |
| Canvas | HTML5 Canvas with devicePixelRatio scaling |
| Backend | FastAPI, Uvicorn, Python 3.10+ |
| Search Engine | Hybrid Search (Semantic FAISS + Keyword TF + RRF) |
| Vector DB | FAISS (IndexFlatIP with L2 normalization) |
| Embeddings | Gemini `gemini-embedding-001` (3072-dim) |
| LLM | Gemini `2.5 Flash` (Router & Generator) |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Rate Limit | slowapi |

## 📄 API Endpoints

| Endpoint | Method | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `/api/register` | POST | ✗ | 10/min | Register user |
| `/api/login` | POST | ✗ | 5/min | Get JWT tokens |
| `/api/refresh` | POST | Refresh | 10/min | Refresh access token |
| `/api/me` | GET | JWT | — | Current user info |
| `/api/chat` | POST | JWT | 20/min | RAG query |
| `/api/chat/stream` | POST | JWT | 20/min | Streaming RAG |
| `/api/health` | GET | ✗ | — | Health check |

## 📝 License

This is a tribute/educational project. Not affiliated with Pagani Automobili.
