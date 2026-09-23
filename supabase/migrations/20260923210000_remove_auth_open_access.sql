-- Suppression de l'authentification : l'application n'a plus de page de
-- login ni de notion de compte. Toutes les tables deviennent accessibles
-- sans restriction (owner_id n'est plus qu'un champ hérité, optionnel).

-- ------------------------------------------------------------- owner_id null
alter table public.prospects       alter column owner_id drop not null;
alter table public.scripts         alter column owner_id drop not null;
alter table public.script_sources  alter column owner_id drop not null;
alter table public.calls           alter column owner_id drop not null;
alter table public.call_messages   alter column owner_id drop not null;
alter table public.ai_suggestions  alter column owner_id drop not null;
-- knowledge_documents / knowledge_chunks / knowledge_rules sont déjà nullable.
alter table public.sync_history    alter column owner_id drop not null;

-- --------------------------------------------------------------- old policies
drop policy if exists "owner" on public.prospects;
drop policy if exists "owner" on public.scripts;
drop policy if exists "owner" on public.script_sources;
drop policy if exists "owner" on public.calls;
drop policy if exists "owner" on public.call_messages;
drop policy if exists "owner" on public.ai_suggestions;
drop policy if exists "owner" on public.knowledge_documents;
drop policy if exists "owner" on public.knowledge_chunks;
drop policy if exists "owner" on public.knowledge_rules;
drop policy if exists "owner" on public.sync_history;
drop policy if exists "shared_awc_read" on public.knowledge_documents;
drop policy if exists "shared_awc_read" on public.knowledge_chunks;
drop policy if exists "shared_awc_read" on public.knowledge_rules;

-- ------------------------------------------------------------- open policies
create policy "public" on public.prospects for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.scripts for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.script_sources for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.calls for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.call_messages for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.ai_suggestions for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.knowledge_documents for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.knowledge_chunks for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.knowledge_rules for all to anon, authenticated
  using (true) with check (true);

create policy "public" on public.sync_history for all to anon, authenticated
  using (true) with check (true);

-- ----------------------------------------------------------------- grants
grant select, insert, update, delete on
  public.prospects,
  public.scripts,
  public.script_sources,
  public.calls,
  public.call_messages,
  public.ai_suggestions,
  public.knowledge_documents,
  public.knowledge_chunks,
  public.knowledge_rules,
  public.sync_history
to anon, authenticated;

-- ------------------------------------------------------- obsolete functions
-- Le mécanisme de revendication de compte n'a plus de sens sans authentification.
drop function if exists public.claim_awc_knowledge();
drop function if exists public.is_awc_allowlisted();
