# LexAI — Supabase Database Setup Guide

## Overview

LexAI uses Supabase (PostgreSQL + Auth + Storage) for persistent data. This guide walks through table creation and configuration.

## Quick Start (3 steps)

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com)
- Click "New Project"
- Choose region (closest to you)
- Set password
- Create

### 2. Add Connection String to .env
```bash
# backend/.env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT-ID].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT-ID].supabase.co
SUPABASE_KEY=[ANON_KEY]  # From Settings > API
SUPABASE_SERVICE_KEY=[SERVICE_ROLE_KEY]  # From Settings > API
```

### 3. Create Tables
Copy entire `supabase_schema.sql` and paste into **Supabase SQL Editor**:
1. Go to **SQL Editor** in left sidebar
2. Click **New Query**
3. Paste entire schema
4. Click **Run**

Done ✅ — Tables created with RLS policies, indexes, views.

---

## Database Schema (8 Tables)

### 1. **users**
Stores lawyer/advocate profiles.

```sql
SELECT * FROM users;
-- id, email, name, avatar_url, supabase_uid, created_at, updated_at
```

**RLS Policies:**
- ✅ Users can view/update only their own data
- ✅ authenticated users can insert

---

### 2. **workspaces**
Case workspaces (one per case).

```sql
-- Get all user's workspaces
SELECT * FROM workspaces WHERE user_id = '...' ORDER BY created_at DESC;

-- Get single workspace with stats
SELECT * FROM workspace_summary WHERE id = '...';
```

**Fields:**
- `name` — "State vs Rahul", "Smith vs Jones", etc.
- `case_type` — criminal, civil, constitutional, family, corporate, general
- `status` — active, archived, closed
- `chroma_collection_id` — Links to ChromaDB collection

**RLS Policies:**
- ✅ Users see only their workspaces
- ✅ Create/update/delete own workspaces

---

### 3. **documents**
Uploaded case files (PDFs, DOCx, TXT).

```sql
-- Get all documents in a workspace
SELECT * FROM documents 
WHERE workspace_id = '...' 
ORDER BY created_at DESC;

-- Documents by status
SELECT status, COUNT(*) FROM documents 
GROUP BY status;
```

**Fields:**
- `filename` — "FIR.pdf", "Petition.docx"
- `file_type` — pdf, docx, txt
- `status` — uploading, processing, indexed, error
- `chunk_count` — Number of embeddings created
- `storage_path` — Path in Supabase Storage

**RLS Policies:**
- ✅ Users see documents only in their workspaces

---

### 4. **messages**
Chat conversation history.

```sql
-- Get all messages in a workspace
SELECT * FROM messages 
WHERE workspace_id = '...' 
ORDER BY created_at ASC;

-- Get last 10 messages
SELECT * FROM messages 
WHERE workspace_id = '...' 
ORDER BY created_at DESC LIMIT 10;

-- Messages by type
SELECT message_type, COUNT(*) FROM messages 
GROUP BY message_type;
```

**Fields:**
- `role` — user, assistant
- `content` — Message text
- `message_type` — chat, counter_args, verdict, draft, search
- `citations` — JSONB array of {title, url, court, date, ...}
- `metadata` — {stage: "...", probability: {...}, ...}

**RLS Policies:**
- ✅ Users see messages only in their workspaces

---

### 5. **search_history**
Caches previous legal searches.

```sql
-- Get user's search history
SELECT * FROM search_history 
WHERE user_id = '...' 
ORDER BY created_at DESC;

-- Search results cache
SELECT query, results FROM search_history 
WHERE user_id = '...' AND query ILIKE '%IPC%';
```

**Fields:**
- `query` — Legal search term
- `results` — JSONB of cached Indian Kanoon + ChromaDB results

---

### 6. **verdict_analyses**
Stores verdict prediction results (optional).

```sql
-- Get all predictions in workspace
SELECT * FROM verdict_analyses 
WHERE workspace_id = '...' 
ORDER BY created_at DESC;

-- Most confident predictions
SELECT workspace_id, probability->>'guilty' as guilty_pct, 
       probability->>'not_guilty' as acquitted_pct
FROM verdict_analyses
ORDER BY probability->>'guilty' DESC;
```

**Fields:**
- `probability` — {guilty: 65, not_guilty: 25, partial_relief: 10, total_cases: 50}
- `analysis` — Full LLM analysis text
- `similar_case_ids` — Text array of related case identifiers

---

### 7. **generated_documents**
Stores AI-drafted legal documents.

```sql
-- Get all generated documents
SELECT * FROM generated_documents 
WHERE workspace_id = '...' 
ORDER BY created_at DESC;

-- Documents by type
SELECT doc_type, COUNT(*) FROM generated_documents 
GROUP BY doc_type;
```

**Fields:**
- `doc_type` — petition, notice, affidavit, bail_application, complaint, reply
- `content` — Full document text (also in storage as DOCX)
- `storage_path` — Supabase Storage path to DOCX file
- `details` — Input parameters {petitioner: "...", court: "...", ...}

---

### 8. **audit_logs** (Optional)
Tracks all user actions for compliance.

```sql
-- Get audit trail for workspace
SELECT * FROM audit_logs 
WHERE workspace_id = '...' 
ORDER BY created_at DESC;

-- User activity timeline
SELECT action, COUNT(*) FROM audit_logs 
WHERE user_id = '...' 
GROUP BY action;
```

**Fields:**
- `action` — document_upload, chat_message, verdict_prediction, etc.
- `details` — JSONB of action-specific data
- `ip_address` — Client IP for security

---

## Views (Fast Queries)

### workspace_summary
Pre-calculated stats for each workspace.

```sql
SELECT * FROM workspace_summary WHERE user_id = '...';
-- Returns: id, name, document_count, total_chunks, message_count, created_at
```

### user_activity
Quick overview of user engagement.

```sql
SELECT * FROM user_activity WHERE email = 'user@example.com';
-- Returns: workspace_count, message_count, document_count, last_activity
```

### recent_messages
Latest 100 messages with workspace/user context.

```sql
SELECT * FROM recent_messages LIMIT 20;
```

---

## Indexes

All tables have indexes for fast querying:

```
✅ idx_users_email                    — Search by email
✅ idx_workspaces_user_id             — User's workspaces
✅ idx_workspaces_status              — Filter by active/archived
✅ idx_documents_workspace_id         — Workspace documents
✅ idx_messages_workspace_id          — Chat messages
✅ idx_messages_created_at            — Sort by recency
✅ idx_search_history_user_id         — User searches
✅ idx_verdict_analyses_workspace_id  — Workspace predictions
```

---

## How to Use in Backend

### Python with SQLAlchemy (Already configured)

The `backend/db/models.py` already defines all these tables:

```python
from db.models import User, Workspace, Document, Message, create_tables

# Create tables (run once)
create_tables()

# Insert user
user = User(email="lawyer@firm.com", name="Advocate Sharma")
db.add(user)
db.commit()

# Create workspace
ws = Workspace(user_id=user.id, name="State vs Rahul", case_type="criminal")
db.add(ws)
db.commit()

# Query messages
messages = db.query(Message).filter(Message.workspace_id == ws.id).all()
```

### Direct SQL Queries

```sql
-- Get user's workspace summary
SELECT * FROM workspace_summary 
WHERE user_id = 'uuid-here' 
ORDER BY created_at DESC;

-- Get recent chat for a case
SELECT role, content, created_at FROM messages 
WHERE workspace_id = 'uuid-here' 
ORDER BY created_at DESC LIMIT 20;

-- Archive old workspace
UPDATE workspaces 
SET status = 'archived' 
WHERE id = 'uuid-here' AND created_at < NOW() - INTERVAL '90 days';
```

---

## Storage Setup (For File Uploads)

### 1. Create Storage Bucket

In Supabase, go to **Storage** → **Create New Bucket**:

```
Bucket name: legal-documents
Public: OFF (private)
Allowed file types: .pdf, .docx, .doc, .txt
Max size: 50 MB
```

### 2. RLS Policies for Storage

```sql
-- Users can upload to their workspace folder
CREATE POLICY "Users can upload documents" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'legal-documents' AND auth.uid() IS NOT NULL);

-- Users can view their documents
CREATE POLICY "Users can view their documents" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'legal-documents');

-- Users can delete their documents
CREATE POLICY "Users can delete their documents" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'legal-documents');
```

### 3. Upload from FastAPI

```python
from supabase import create_client, Client

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

# Upload file
response = supabase.storage.from_('legal-documents').upload(
    f"{user_id}/{workspace_id}/FIR.pdf",
    file_bytes,
    {"cacheControl": "3600", "upsert": "false"}
)

# Get public URL (if needed)
url = supabase.storage.from_('legal-documents').get_public_url(
    f"{user_id}/{workspace_id}/FIR.pdf"
)
```

---

## Backup & Restore

### Download Backup

**Dashboard** → **Settings** → **Backups** → **Download latest backup**

### Restore from SQL

```bash
# Restore from backup
psql -h [PROJECT-ID].supabase.co -U postgres < backup.sql
```

---

## Monitoring & Maintenance

### Check Storage Usage
**Dashboard** → **Storage** → View size

### Monitor Active Connections
**Dashboard** → **Logs** → **Database** → Check query performance

### Optimize Indexes
```sql
-- Find unused indexes
SELECT * FROM pg_stat_user_indexes 
WHERE idx_scan = 0 AND indexname NOT LIKE 'pg_%';

-- Analyze table for query planner
ANALYZE messages;
```

---

## Common Queries for LexAI Frontend/Backend

```python
# Get workspace with full context
workspace = db.query(Workspace).filter(
    Workspace.id == workspace_id,
    Workspace.user_id == user_id
).first()

# Get documents in workspace
docs = db.query(Document).filter(
    Document.workspace_id == workspace_id,
    Document.status == 'indexed'
).order_by(Document.created_at.desc()).all()

# Get chat history
messages = db.query(Message).filter(
    Message.workspace_id == workspace_id
).order_by(Message.created_at.asc()).all()

# Save new message
msg = Message(
    workspace_id=workspace_id,
    role='user',
    content="What are the charges?",
    message_type='chat'
)
db.add(msg)
db.commit()

# Log action
log = AuditLog(
    user_id=user_id,
    workspace_id=workspace_id,
    action='document_upload',
    details={'filename': 'FIR.pdf', 'size': 2048000}
)
db.add(log)
db.commit()
```

---

## Troubleshooting

### "permission denied" when inserting
- ❌ Check RLS policies are enabled
- ✅ Ensure `user_id` matches authenticated user
- ✅ User must have workspace in their workspaces table first

### Queries run slow
- ❌ Check indexes exist with `\di` in SQL editor
- ✅ Use `EXPLAIN` to see query plan
- ✅ Consider archiving old messages/documents

### Can't connect from FastAPI
- ❌ Check `DATABASE_URL` in `.env`
- ✅ Verify network whitelist in Supabase **Settings** → **Network**
- ✅ Test connection: `psql $DATABASE_URL -c "SELECT 1;"`

---

## Security Checklist

✅ RLS policies enabled on all tables
✅ Service key never exposed (backend only)
✅ Anon key restricted in Supabase policies
✅ File uploads validated by type/size
✅ Audit logs track all sensitive actions
✅ Old documents deleted after retention period
✅ Regular backups downloaded and stored

---

**Ready to go!** 🚀 Your Supabase database is production-ready for LexAI.
