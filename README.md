# LexAI — Indian Legal AI Operating System

An AI-native legal workspace inspired by Indian Kanoon Prism AI, Harvey AI, and Perplexity AI.

## Tech Stack

| Layer        | Technology |
|-------------|-----------|
| Frontend     | React 18 + Vite + TailwindCSS + Framer Motion |
| Backend      | FastAPI + Uvicorn |
| LLM          | Groq API (llama-3.3-70b-versatile) |
| Vector DB    | ChromaDB |
| Embeddings   | all-MiniLM-L6-v2 (sentence-transformers) |
| Legal Search | Indian Kanoon API |
| State Mgmt   | Zustand |
| Streaming    | SSE (Server-Sent Events) |

## Project Structure

```
lexai/
├── backend/
│   ├── main.py                    ← FastAPI app (all endpoints)
│   ├── config.py                  ← Settings from .env
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   ├── legal_agents.py        ← Counter args, verdict, draft, search agents
│   │   └── report_builder.py     ← DOCX brief generator
│   ├── rag/
│   │   ├── document_parser.py    ← PDF/DOCX extraction + smart chunking
│   │   └── vector_store.py       ← ChromaDB embed + retrieve
│   ├── services/
│   │   ├── groq_service.py       ← LLM streaming + prompt templates
│   │   └── kanoon.py             ← Indian Kanoon API integration
│   └── db/
│       └── models.py             ← SQLAlchemy models (Supabase/PostgreSQL)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx               ← Root + React Router
        ├── main.jsx
        ├── index.css             ← Design system + custom classes
        ├── store/index.js        ← Zustand global state
        ├── services/api.js       ← All API calls + SSE stream client
        ├── hooks/useStream.js    ← Universal streaming hook
        ├── layouts/
        │   └── WorkspaceLayout.jsx
        ├── components/
        │   ├── layout/Sidebar.jsx
        │   └── features/
        │       ├── ChatMessage.jsx
        │       ├── CitationsPanel.jsx
        │       ├── UploadDropzone.jsx
        │       └── NewWorkspaceModal.jsx
        └── pages/
            ├── LandingPage.jsx
            ├── ChatPage.jsx
            └── WorkspacePages.jsx  ← Search, CounterArgs, Verdict, Draft, Documents
```

## Setup Instructions

### 1. Backend Setup

```bash
# Create conda environment
conda create -n lexai python=3.11
conda activate lexai

# Install dependencies
cd lexai/backend
pip install -r requirements.txt

# Copy and configure .env
cp .env.example .env
# Edit .env and add your API keys:
#   GROQ_API_KEY=gsk_...
#   INDIAN_KANOON_API_KEY=...  (optional, mock results if not set)
```

### 2. Frontend Setup

```bash
cd lexai/frontend
npm install
```

### 3. Run the App

**Terminal 1 — Backend:**
```bash
cd lexai/backend
conda activate lexai
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd lexai/frontend
npm run dev
# Opens at http://localhost:5173
```

## API Keys

### Groq API (Required)
1. Go to https://console.groq.com
2. Create API key
3. Add to `.env` as `GROQ_API_KEY`

### Indian Kanoon API (Recommended)
1. Go to https://api.indiankanoon.org
2. Request API access
3. Add to `.env` as `INDIAN_KANOON_API_KEY`
4. Without this key, mock results are returned

### Supabase (Optional — for persistent storage)
1. Create project at https://supabase.com
2. Add `SUPABASE_URL` and `SUPABASE_KEY` to `.env`
3. Uncomment `create_tables()` in `main.py`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/health` | Backend status |
| POST | `/workspaces` | Create workspace |
| POST | `/workspaces/{id}/upload` | Upload documents |
| GET  | `/workspaces/{id}/stats` | Collection stats |
| POST | `/chat/stream` | SSE: RAG chat |
| POST | `/counter-arguments/stream` | SSE: Counter args |
| POST | `/verdict/stream` | SSE: Verdict prediction |
| POST | `/draft/stream` | SSE: Document drafting |
| POST | `/search/stream` | SSE: Legal search |
| GET  | `/search/kanoon` | Indian Kanoon search |
| POST | `/report/generate` | Download DOCX brief |

## Core Flows

### 1. Document Upload → RAG Ready
```
User uploads PDF → FastAPI receives → PyMuPDF extracts text
→ smart_chunk() splits by sections → MiniLM generates embeddings
→ ChromaDB stores per workspace → Ready for semantic retrieval
```

### 2. AI Chat (RAG Pipeline)
```
User query → ChromaDB semantic_search (Top-6 chunks)
→ Indian Kanoon API search (4 precedents)
→ Merge context → Build RAG prompt
→ Groq llama-3.3-70b stream → SSE tokens to React
→ Citations panel updated
```

### 3. Counter Argument Generation
```
Petition text → LLM extracts arguments
→ Parallel Indian Kanoon search for opposing precedents
→ ChromaDB retrieves counter-evidence
→ Groq generates defense strategy → SSE stream
```

### 4. Verdict Prediction
```
Case facts → ChromaDB finds 10 similar cases
→ Indian Kanoon searches judgments
→ Keyword analysis: guilty/acquitted/partial
→ Probability calculated → LLM generates analysis
```

## MSc Project Notes

This project demonstrates:
- **RAG Architecture**: Workspace-scoped vector retrieval
- **Multi-Agent System**: 4 specialized legal AI agents
- **Streaming AI**: Real-time SSE token streaming
- **Indian Legal NLP**: Domain-aware chunking for IPC/CrPC/Constitution
- **API Integration**: Indian Kanoon 15M+ judgment database
- **Production Patterns**: FastAPI, Zustand, React Router, proper error handling
#
