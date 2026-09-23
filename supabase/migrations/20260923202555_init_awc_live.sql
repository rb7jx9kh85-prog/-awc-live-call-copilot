-- AWC LIVE — schéma initial
--
-- Toutes les tables exposées via PostgREST ont RLS activé et une politique
-- propriétaire : un utilisateur n'accède qu'à ses propres lignes, et les
-- tables filles vérifient aussi le propriétaire du parent (défense en
-- profondeur contre une ligne orpheline rattachée à un autre compte).

-- ---------------------------------------------------------------- prospects
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company text not null,
  first_name text,
  last_name text,
  website text,
  sector text,
  phone text,
  offer text,
  price text,
  problems text,
  weaknesses text,
  prior_info text,
  notes text,
  objective text,
  script text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ scripts
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.script_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  script_id uuid references public.scripts (id) on delete cascade,
  drive_file_id text not null,
  title text not null,
  source_url text,
  modified_at timestamptz,
  revision_id text,
  content_hash text,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- calls
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  prospect_id uuid references public.prospects (id) on delete set null,
  company text not null,
  script_name text,
  status text not null default 'live',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result text,
  summary text,
  notes text,
  next_action text,
  compact_context jsonb not null default '{}'::jsonb
);

create table if not exists public.call_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  speaker text not null check (speaker in ('MOI', 'PROSPECT')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  call_id uuid not null references public.calls (id) on delete cascade,
  input_text text not null,
  stage text,
  objection_type text,
  action text,
  response text,
  payload jsonb not null default '{}'::jsonb,
  knowledge_rule_ids text[] not null default '{}'::text[],
  engine text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- knowledge
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  drive_file_id text,
  title text not null,
  source_url text,
  revision_id text,
  modified_at timestamptz,
  content_hash text,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  section text,
  content text not null,
  stage text,
  objection_type text,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.knowledge_documents (id) on delete cascade,
  section text,
  stage text,
  objection_type text,
  rule_text text not null,
  priority integer not null default 0,
  conflict_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  imported integer not null default 0,
  conflicts jsonb not null default '[]'::jsonb,
  detail text
);

-- ------------------------------------------------------------------ indexes
create index if not exists prospects_owner_idx on public.prospects (owner_id);
create index if not exists calls_owner_started_idx on public.calls (owner_id, started_at desc);
create index if not exists call_messages_call_idx on public.call_messages (call_id, created_at);
create index if not exists ai_suggestions_call_idx on public.ai_suggestions (call_id, created_at);
create index if not exists knowledge_chunks_lookup_idx
  on public.knowledge_chunks (owner_id, stage, objection_type, priority desc);
create index if not exists knowledge_rules_lookup_idx
  on public.knowledge_rules (owner_id, stage, objection_type, priority desc);

-- ---------------------------------------------------------------------- RLS
alter table public.prospects enable row level security;
alter table public.scripts enable row level security;
alter table public.script_sources enable row level security;
alter table public.calls enable row level security;
alter table public.call_messages enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_rules enable row level security;
alter table public.sync_history enable row level security;

create policy "owner" on public.prospects for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owner" on public.scripts for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owner" on public.script_sources for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and (script_id is null or exists (
      select 1 from public.scripts s
      where s.id = script_id and s.owner_id = (select auth.uid())
    ))
  )
  with check (
    (select auth.uid()) = owner_id
    and (script_id is null or exists (
      select 1 from public.scripts s
      where s.id = script_id and s.owner_id = (select auth.uid())
    ))
  );

create policy "owner" on public.calls for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and (prospect_id is null or exists (
      select 1 from public.prospects p
      where p.id = prospect_id and p.owner_id = (select auth.uid())
    ))
  )
  with check (
    (select auth.uid()) = owner_id
    and (prospect_id is null or exists (
      select 1 from public.prospects p
      where p.id = prospect_id and p.owner_id = (select auth.uid())
    ))
  );

create policy "owner" on public.call_messages for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.calls c
      where c.id = call_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.calls c
      where c.id = call_id and c.owner_id = (select auth.uid())
    )
  );

create policy "owner" on public.ai_suggestions for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.calls c
      where c.id = call_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.calls c
      where c.id = call_id and c.owner_id = (select auth.uid())
    )
  );

create policy "owner" on public.knowledge_documents for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owner" on public.knowledge_chunks for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.knowledge_documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.knowledge_documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    )
  );

create policy "owner" on public.knowledge_rules for all to authenticated
  using (
    (select auth.uid()) = owner_id
    and (document_id is null or exists (
      select 1 from public.knowledge_documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    ))
  )
  with check (
    (select auth.uid()) = owner_id
    and (document_id is null or exists (
      select 1 from public.knowledge_documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    ))
  );

create policy "owner" on public.sync_history for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
