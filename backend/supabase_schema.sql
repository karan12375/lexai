-- LexAI Supabase schema (production-aligned)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Core tables
-- -----------------------------------------------------------------------------

create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  email text unique not null,
  name text not null,
  avatar_url text,
  supabase_uid text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.workspaces (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  case_type text,
  status text not null default 'active',
  chroma_collection_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.chat_threads (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  last_message_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  filename text not null,
  original_filename text not null,
  file_type text not null,
  file_size integer,
  storage_path text,
  status text not null default 'uploading',
  chunk_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  chat_id text references public.chat_threads(id) on delete set null,
  role text not null,
  content text not null,
  message_type text not null default 'chat',
  citations jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.search_history (
  id text primary key default gen_random_uuid()::text,
  workspace_id text references public.workspaces(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  query text not null,
  results jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.verdict_analyses (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_documents (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  title text not null,
  document_type text,
  content text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Backward-compatible migration for existing messages table
-- -----------------------------------------------------------------------------

alter table public.messages
  add column if not exists chat_id text references public.chat_threads(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Indexes for query performance
-- -----------------------------------------------------------------------------

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_supabase_uid on public.users(supabase_uid);

create index if not exists idx_workspaces_user_status_created
  on public.workspaces(user_id, status, created_at desc);
create index if not exists idx_workspaces_user_name
  on public.workspaces(user_id, name);

create index if not exists idx_chat_threads_workspace_status_last
  on public.chat_threads(workspace_id, status, last_message_at desc);
create index if not exists idx_chat_threads_workspace_created
  on public.chat_threads(workspace_id, created_at desc);

create index if not exists idx_documents_workspace_status_created
  on public.documents(workspace_id, status, created_at desc);
create index if not exists idx_documents_workspace_filename
  on public.documents(workspace_id, filename);

create index if not exists idx_messages_workspace_chat_created
  on public.messages(workspace_id, chat_id, created_at desc);
create index if not exists idx_messages_workspace_type_created
  on public.messages(workspace_id, message_type, created_at desc);
create index if not exists idx_messages_workspace_role_created
  on public.messages(workspace_id, role, created_at desc);
create index if not exists idx_messages_chat_id
  on public.messages(chat_id);

create index if not exists idx_search_history_user_workspace_created
  on public.search_history(user_id, workspace_id, created_at desc);

create index if not exists idx_verdict_analyses_workspace_created
  on public.verdict_analyses(workspace_id, created_at desc);

create index if not exists idx_generated_documents_workspace_type_created
  on public.generated_documents(workspace_id, document_type, created_at desc);

-- -----------------------------------------------------------------------------
-- Helper functions for ownership checks
-- -----------------------------------------------------------------------------

create or replace function public.current_lexai_user_id()
returns text
language sql
stable
as $$
  select u.id
  from public.users u
  where u.supabase_uid = auth.uid()::text
  limit 1
$$;

create or replace function public.workspace_owned_by_auth(workspace_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.users u on u.id = w.user_id
    where w.id = workspace_id
      and u.supabase_uid = auth.uid()::text
  )
$$;

create or replace function public.row_workspace_id_from_chat(chat_thread_id text)
returns text
language sql
stable
as $$
  select c.workspace_id
  from public.chat_threads c
  where c.id = chat_thread_id
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at
before update on public.users
for each row execute function public.update_updated_at_column();

drop trigger if exists update_workspaces_updated_at on public.workspaces;
create trigger update_workspaces_updated_at
before update on public.workspaces
for each row execute function public.update_updated_at_column();

drop trigger if exists update_chat_threads_updated_at on public.chat_threads;
create trigger update_chat_threads_updated_at
before update on public.chat_threads
for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.chat_threads enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;
alter table public.search_history enable row level security;
alter table public.verdict_analyses enable row level security;
alter table public.generated_documents enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
for select
using (supabase_uid = auth.uid()::text);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
for insert
with check (supabase_uid = auth.uid()::text or auth.role() = 'service_role');

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
for update
using (supabase_uid = auth.uid()::text)
with check (supabase_uid = auth.uid()::text);

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces
for select
using (public.workspace_owned_by_auth(id));

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces
for insert
with check (
  user_id = public.current_lexai_user_id()
  or auth.role() = 'service_role'
);

drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own on public.workspaces
for update
using (public.workspace_owned_by_auth(id))
with check (public.workspace_owned_by_auth(id));

drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces
for delete
using (public.workspace_owned_by_auth(id));

drop policy if exists chat_threads_select_own on public.chat_threads;
create policy chat_threads_select_own on public.chat_threads
for select
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists chat_threads_insert_own on public.chat_threads;
create policy chat_threads_insert_own on public.chat_threads
for insert
with check (public.workspace_owned_by_auth(workspace_id) or auth.role() = 'service_role');

drop policy if exists chat_threads_update_own on public.chat_threads;
create policy chat_threads_update_own on public.chat_threads
for update
using (public.workspace_owned_by_auth(workspace_id))
with check (public.workspace_owned_by_auth(workspace_id));

drop policy if exists chat_threads_delete_own on public.chat_threads;
create policy chat_threads_delete_own on public.chat_threads
for delete
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
for select
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents
for insert
with check (public.workspace_owned_by_auth(workspace_id) or auth.role() = 'service_role');

drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents
for delete
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
for select
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
for insert
with check (public.workspace_owned_by_auth(workspace_id) or auth.role() = 'service_role');

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages
for delete
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists search_history_select_own on public.search_history;
create policy search_history_select_own on public.search_history
for select
using (user_id = public.current_lexai_user_id());

drop policy if exists search_history_insert_own on public.search_history;
create policy search_history_insert_own on public.search_history
for insert
with check (
  user_id = public.current_lexai_user_id()
  or auth.role() = 'service_role'
);

drop policy if exists verdict_analyses_select_own on public.verdict_analyses;
create policy verdict_analyses_select_own on public.verdict_analyses
for select
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists verdict_analyses_insert_own on public.verdict_analyses;
create policy verdict_analyses_insert_own on public.verdict_analyses
for insert
with check (public.workspace_owned_by_auth(workspace_id) or auth.role() = 'service_role');

drop policy if exists generated_documents_select_own on public.generated_documents;
create policy generated_documents_select_own on public.generated_documents
for select
using (public.workspace_owned_by_auth(workspace_id));

drop policy if exists generated_documents_insert_own on public.generated_documents;
create policy generated_documents_insert_own on public.generated_documents
for insert
with check (public.workspace_owned_by_auth(workspace_id) or auth.role() = 'service_role');

