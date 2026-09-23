-- Bibliothèque AWC partagée + revendication au premier accès.
--
-- Ce dépôt est public : les scripts commerciaux d'Alpinia n'y sont pas
-- versionnés. Ils sont importés directement en base avec owner_id = null.
-- Tant qu'aucun compte ne les a revendiqués, ils ne sont lisibles que par une
-- adresse explicitement inscrite dans app_allowlist.

create table if not exists public.app_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

alter table public.app_allowlist enable row level security;

-- Aucune policy volontairement : la table n'est jamais lue depuis le client.
-- Seule la fonction security definer ci-dessous la consulte.
--
-- Les adresses autorisées ne sont pas versionnées ici. Les ajouter depuis le
-- SQL editor Supabase :
--
--   insert into public.app_allowlist (email, note)
--   values ('vous@exemple.com', 'propriétaire')
--   on conflict (email) do nothing;

-- owner_id devient nullable sur la knowledge base uniquement.
alter table public.knowledge_documents alter column owner_id drop not null;
alter table public.knowledge_chunks   alter column owner_id drop not null;
alter table public.knowledge_rules    alter column owner_id drop not null;

create or replace function public.is_awc_allowlisted()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_allowlist a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_awc_allowlisted() from public, anon;
-- `authenticated` doit pouvoir l'exécuter : les policies ci-dessous
-- l'évaluent avec le rôle de l'appelant.
grant execute on function public.is_awc_allowlisted() to authenticated;

-- Lecture de la bibliothèque non revendiquée, réservée aux comptes autorisés.
create policy "shared_awc_read" on public.knowledge_documents for select to authenticated
  using (owner_id is null and public.is_awc_allowlisted());

create policy "shared_awc_read" on public.knowledge_chunks for select to authenticated
  using (owner_id is null and public.is_awc_allowlisted());

create policy "shared_awc_read" on public.knowledge_rules for select to authenticated
  using (owner_id is null and public.is_awc_allowlisted());

-- Revendication : rattache la bibliothèque au compte appelant.
create or replace function public.claim_awc_knowledge()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  claimed integer := 0;
begin
  if uid is null or not public.is_awc_allowlisted() then
    raise exception 'not allowed';
  end if;

  update public.knowledge_documents set owner_id = uid where owner_id is null;
  get diagnostics claimed = row_count;

  update public.knowledge_chunks set owner_id = uid where owner_id is null;
  update public.knowledge_rules  set owner_id = uid where owner_id is null;

  insert into public.sync_history (owner_id, status, imported, finished_at, detail)
  values (uid, 'claimed', claimed, now(), 'Bibliothèque AWC rattachée au compte');

  return claimed;
end;
$$;

revoke all on function public.claim_awc_knowledge() from public, anon;
grant execute on function public.claim_awc_knowledge() to authenticated;
