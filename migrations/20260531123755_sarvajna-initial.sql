-- Sarvajna: multi-model chat + document RAG
create extension if not exists vector;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  model text not null default 'openai/gpt-4o',
  use_documents boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

create table user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_key text not null,
  storage_url text,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  chunk_count int not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table document_chunks (
  id bigserial primary key,
  document_id uuid not null references user_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  chunk_index int not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index conversations_user_id_idx on conversations(user_id);
create index messages_conversation_id_idx on messages(conversation_id);
create index user_documents_user_id_idx on user_documents(user_id);
create index document_chunks_document_id_idx on document_chunks(document_id);
create index document_chunks_user_id_idx on document_chunks(user_id);
create index document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);

create or replace function match_user_chunks(
  p_user_id uuid,
  query_embedding vector(1536),
  match_count int default 8,
  match_threshold float default 0.72
)
returns table (
  id bigint,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
security definer
set search_path = public
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join user_documents ud on ud.id = dc.document_id
  where dc.user_id = p_user_id
    and ud.status = 'ready'
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

alter table conversations enable row level security;
alter table messages enable row level security;
alter table user_documents enable row level security;
alter table document_chunks enable row level security;

create policy conversations_select on conversations for select using (user_id = auth.uid());
create policy conversations_insert on conversations for insert with check (user_id = auth.uid());
create policy conversations_update on conversations for update using (user_id = auth.uid());
create policy conversations_delete on conversations for delete using (user_id = auth.uid());

create policy messages_select on messages for select using (user_id = auth.uid());
create policy messages_insert on messages for insert with check (user_id = auth.uid());
create policy messages_delete on messages for delete using (user_id = auth.uid());

create policy user_documents_select on user_documents for select using (user_id = auth.uid());
create policy user_documents_insert on user_documents for insert with check (user_id = auth.uid());
create policy user_documents_update on user_documents for update using (user_id = auth.uid());
create policy user_documents_delete on user_documents for delete using (user_id = auth.uid());

create policy document_chunks_select on document_chunks for select using (user_id = auth.uid());
create policy document_chunks_insert on document_chunks for insert with check (user_id = auth.uid());
create policy document_chunks_delete on document_chunks for delete using (user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on conversations, messages, user_documents, document_chunks to authenticated;
grant execute on function match_user_chunks to authenticated;
