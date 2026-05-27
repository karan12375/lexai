# 📖 LexAI Documentation Guide

## What are Markdown Files?

Markdown files (`.md`) are **documentation files** written in plain text with simple formatting. They're not code — they're guides for humans to read.

**Files in LexAI:**
1. `README.md` — Project overview & quick start
2. `SUPABASE_SETUP.md` — Database configuration guide
3. `setup_supabase.sh` — Automated setup script (bash)

---

## 📄 README.md

### What it is
Project overview and getting started guide.

### How to use it
**Read it first!** When you unzip, open `README.md` with:
- ✅ Any text editor (VS Code, Sublime, Notepad)
- ✅ GitHub (will render beautifully)
- ✅ Any markdown viewer

### What it contains
- Tech stack overview
- Project structure
- How to run backend & frontend
- API endpoints documentation
- Core workflows

**Action:** Read it, don't modify it.

---

## 📚 SUPABASE_SETUP.md

### What it is
Complete guide for setting up your Supabase database.

### How to use it
1. Read this **before** running setup script
2. Understand the database schema
3. Get your Supabase credentials
4. Follow along with setup

### What it contains
- Quick start (3 steps)
- Complete schema explanation (8 tables)
- How to use from Python/backend
- Common SQL queries
- Storage setup for file uploads
- Troubleshooting tips
- Backup & restore procedures

**Action:** Read it, follow the steps in order.

---

## 🔧 setup_supabase.sh

### What it is
**Automated bash script** that creates all database tables in Supabase.

### How to use it

#### Prerequisites
1. **Create Supabase project**
   - Go to https://supabase.com
   - Click "New Project"
   - Choose region
   - Save credentials

2. **Install psql** (PostgreSQL client)
   ```bash
   # macOS
   brew install postgresql

   # Ubuntu/Debian
   sudo apt install postgresql-client

   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

3. **Create .env file** in `backend/` folder:
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and add your credentials:
   ```
   
   In `.env`, fill these:
   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT-ID].supabase.co:5432/postgres
   SUPABASE_URL=https://[PROJECT-ID].supabase.co
   SUPABASE_KEY=[ANON_KEY]
   SUPABASE_SERVICE_KEY=[SERVICE_ROLE_KEY]
   GROQ_API_KEY=gsk_...
   ```

   **How to get these credentials:**
   - Go to Supabase Dashboard
   - Click "Settings" (gear icon)
   - Click "API"
   - Copy the values:
     - `Project URL` → SUPABASE_URL
     - `anon public` → SUPABASE_KEY
     - `service_role secret` → SUPABASE_SERVICE_KEY
     - Password is what you set when creating project

#### Run the script

**macOS/Linux:**
```bash
# Make sure you're in lexai_final/ directory
cd lexai_final

# Run the setup script
bash setup_supabase.sh
```

**Windows (Git Bash or WSL):**
```bash
cd lexai_final
bash setup_supabase.sh
```

**Windows (PowerShell):**
```powershell
cd lexai_final
bash ./setup_supabase.sh
```

#### What the script does
1. ✅ Checks .env file exists
2. ✅ Tests database connection
3. ✅ Reads `backend/supabase_schema.sql`
4. ✅ Creates all 8 tables
5. ✅ Creates indexes for performance
6. ✅ Sets up RLS security policies
7. ✅ Creates 3 helper views
8. ✅ Verifies everything worked
9. ✅ Shows summary

#### Expected output
```
✅ Found .env file
📦 Connection Details:
   Database: postgresql://...
   URL: https://xxxxx.supabase.co

🔗 Testing database connection...
✅ Connection successful!

📝 Creating database tables...
✅ All tables created successfully!
   Total tables created: 8

📊 Verifying database structure...
Tables created:
   ✅ users
   ✅ workspaces
   ✅ documents
   ✅ messages
   ✅ search_history
   ✅ verdict_analyses
   ✅ generated_documents
   ✅ audit_logs

Views created:
   📈 workspace_summary
   📈 user_activity
   📈 recent_messages

Security & Performance:
   ✅ Indexes created: 17
   ✅ RLS policies: 24

✅ SETUP COMPLETE
```

---

## 📋 Step-by-Step Setup (Complete)

### Step 1: Unzip
```bash
unzip lexai_final.zip
cd lexai_final
```

### Step 2: Read Documentation
```bash
# Open and read in your editor
cat README.md          # Project overview
cat SUPABASE_SETUP.md  # Database guide
```

### Step 3: Create Supabase Project
1. Go to https://supabase.com
2. Click "New Project"
3. Enter name: "lexai"
4. Choose region (closest to you)
5. Set password
6. Wait for project to initialize (2-3 min)

### Step 4: Get Credentials
1. In Supabase Dashboard, click **Settings** (gear)
2. Click **API** in left sidebar
3. Copy:
   - `Project URL` 
   - `anon public` key
   - `service_role` key
   - Your password

### Step 5: Create .env File
```bash
cd backend
cp .env.example .env

# Edit .env with your credentials
# (Use VS Code or any text editor)
```

Contents should be:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@PROJECT_ID.supabase.co:5432/postgres
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_KEY=YOUR_SERVICE_KEY
GROQ_API_KEY=gsk_YOUR_GROQ_KEY
INDIAN_KANOON_API_KEY=your_ik_key_or_leave_blank
```

### Step 6: Run Setup Script
```bash
# From lexai_final/ directory
bash setup_supabase.sh
```

Wait for it to complete (should show ✅ SETUP COMPLETE)

### Step 7: Install Dependencies
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### Step 8: Start Backend (Terminal 1)
```bash
cd backend
python -m uvicorn main_with_supabase:app --reload --port 8000
```

### Step 9: Start Frontend (Terminal 2)
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in browser

---

## 🐛 Troubleshooting

### "psql: command not found"
**Solution:** Install PostgreSQL client
```bash
# macOS
brew install postgresql

# Ubuntu
sudo apt install postgresql-client
```

### "Cannot connect to database"
**Solutions:**
1. Check DATABASE_URL is correct
2. Verify Supabase project is running
3. Add your IP to whitelist:
   - Supabase Dashboard → Settings → Network
   - Click "Add current IP address"

### ".env file not found"
**Solution:**
```bash
cd backend
cp .env.example .env
# Then edit .env with your credentials
```

### "ModuleNotFoundError"
**Solution:**
```bash
pip install -r requirements.txt
```

### "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org

---

## 📱 What Happens After Setup

### Database is Ready ✅
- All 8 tables created
- RLS security enabled
- Indexes for performance
- Ready to store data

### Backend Works ✅
- FastAPI running on port 8000
- Can upload documents
- Can process with ChromaDB
- Can call Groq API
- Can save to Supabase

### Frontend Works ✅
- React app on port 5173
- Can create workspaces
- Can upload documents
- Can chat with AI
- Can generate documents
- Data persists in Supabase

---

## 📊 Database After Setup

Your Supabase database has:

```
✅ 8 tables
   - users (lawyer profiles)
   - workspaces (case workspaces)
   - documents (uploaded files)
   - messages (chat history)
   - search_history (cached queries)
   - verdict_analyses (predictions)
   - generated_documents (AI drafts)
   - audit_logs (action tracking)

✅ 3 views (for quick queries)
   - workspace_summary
   - user_activity
   - recent_messages

✅ 17 indexes (fast queries)
✅ 24 RLS policies (security)
✅ Triggers (auto-update timestamps)
```

---

## 🔒 Security Notes

- ✅ All data is encrypted in transit (SSL)
- ✅ RLS policies prevent users from seeing each other's data
- ✅ Service key only used by backend (never expose)
- ✅ Anon key has restricted permissions
- ✅ Audit logs track all sensitive actions
- ✅ Regular backups available

---

## 📞 Need Help?

Check these files in order:
1. `README.md` — General overview
2. `SUPABASE_SETUP.md` — Database questions
3. `backend/.env.example` — Configuration reference
4. `backend/supabase_schema.sql` — SQL structure

---

## ✨ You're Ready!

After setup:
- ✅ Backend on http://localhost:8000
- ✅ Frontend on http://localhost:5173
- ✅ Database on Supabase
- ✅ Ready to demo/submit

Good luck with your MSc project! 🚀
