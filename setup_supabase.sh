#!/bin/bash

# LexAI — Supabase Database Setup Script
# This script automates the database creation in Supabase
# Run this AFTER you have Supabase project created

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    LexAI Supabase Setup                       ║"
echo "║                    Indian Legal AI Platform                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 1: Check if .env exists
# ═══════════════════════════════════════════════════════════════════════════

if [ ! -f ".env" ]; then
    echo "❌ ERROR: .env file not found!"
    echo ""
    echo "Please create .env file with:"
    echo "  DATABASE_URL=postgresql://postgres:[PASSWORD]@[PROJECT-ID].supabase.co:5432/postgres"
    echo "  SUPABASE_URL=https://[PROJECT-ID].supabase.co"
    echo "  SUPABASE_KEY=[ANON_KEY]"
    echo "  SUPABASE_SERVICE_KEY=[SERVICE_ROLE_KEY]"
    echo ""
    echo "Get these from: Supabase Dashboard → Settings → API"
    exit 1
fi

echo "✅ Found .env file"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 2: Extract connection details
# ═══════════════════════════════════════════════════════════════════════════

DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2)
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d'=' -f2)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set in .env"
    exit 1
fi

echo "📦 Connection Details:"
echo "   Database: $DATABASE_URL"
echo "   URL: $SUPABASE_URL"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 3: Test connection
# ═══════════════════════════════════════════════════════════════════════════

echo "🔗 Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Connection successful!"
else
    echo "❌ Cannot connect to database"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check DATABASE_URL is correct"
    echo "  2. Verify Supabase project is running"
    echo "  3. Check network whitelist: Supabase → Settings → Network"
    echo ""
    echo "If psql not installed, install with:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt install postgresql-client"
    exit 1
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 4: Create tables from SQL file
# ═══════════════════════════════════════════════════════════════════════════

echo "📝 Creating database tables..."
echo ""

if [ ! -f "backend/supabase_schema.sql" ]; then
    echo "❌ ERROR: backend/supabase_schema.sql not found!"
    echo "Make sure you're in the lexai_final directory"
    exit 1
fi

# Execute SQL schema
if psql "$DATABASE_URL" -f backend/supabase_schema.sql > /tmp/lexai_setup.log 2>&1; then
    echo "✅ All tables created successfully!"
    echo ""
    # Count tables
    TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
    echo "   Total tables created: $TABLE_COUNT"
    echo ""
else
    echo "❌ Error creating tables"
    echo ""
    echo "Error details:"
    cat /tmp/lexai_setup.log
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════
# STEP 5: Verify tables and show summary
# ═══════════════════════════════════════════════════════════════════════════

echo "📊 Verifying database structure..."
echo ""

echo "Tables created:"
psql "$DATABASE_URL" -t -c "
  SELECT '   ✅ ' || tablename 
  FROM pg_tables 
  WHERE schemaname='public' 
  ORDER BY tablename;
" || true

echo ""
echo "Views created:"
psql "$DATABASE_URL" -t -c "
  SELECT '   📈 ' || viewname 
  FROM pg_views 
  WHERE schemaname='public' 
  ORDER BY viewname;
" || true

echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 6: Verify indexes and RLS
# ═══════════════════════════════════════════════════════════════════════════

INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public'")
RLS_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_policies")

echo "Security & Performance:"
echo "   ✅ Indexes created: $INDEX_COUNT"
echo "   ✅ RLS policies: $RLS_COUNT"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# STEP 7: Summary and next steps
# ═══════════════════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   ✅ SETUP COMPLETE                          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

echo "📋 Database Summary:"
echo "   • Users table: stores lawyer profiles"
echo "   • Workspaces: case workspaces (one per case)"
echo "   • Documents: uploaded PDFs, DOCx, TXT files"
echo "   • Messages: chat conversation history"
echo "   • Search history: cached legal searches"
echo "   • Verdict analyses: prediction results"
echo "   • Generated documents: AI-drafted files"
echo "   • Audit logs: action tracking"
echo ""

echo "🚀 Next Steps:"
echo ""
echo "1️⃣  Update backend/.env with your API keys:"
echo "   GROQ_API_KEY=gsk_..."
echo "   INDIAN_KANOON_API_KEY=... (optional)"
echo ""
echo "2️⃣  Install backend dependencies:"
echo "   cd backend"
echo "   pip install -r requirements.txt"
echo ""
echo "3️⃣  Install frontend dependencies:"
echo "   cd frontend"
echo "   npm install"
echo ""
echo "4️⃣  Start backend (Terminal 1):"
echo "   cd backend"
echo "   python -m uvicorn main_with_supabase:app --reload --port 8000"
echo ""
echo "5️⃣  Start frontend (Terminal 2):"
echo "   cd frontend"
echo "   npm run dev"
echo "   → http://localhost:5173"
echo ""

echo "📚 Documentation:"
echo "   • README.md — Project overview"
echo "   • SUPABASE_SETUP.md — Detailed database guide"
echo ""

echo "💡 Pro Tips:"
echo "   • All data is isolated per user (RLS policies)"
echo "   • Backups can be downloaded from Supabase Dashboard"
echo "   • Monitor logs: Supabase → Logs → Database"
echo ""

echo "✨ You're all set! Happy coding! 🎉"
echo ""
