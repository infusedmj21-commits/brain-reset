-- Brain Reset sync schema.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Every synced row from every local table lives in one table, keyed by
-- (user, local table, row id). The row itself is kept whole in `data`, so the
-- app can add fields without schema changes here.

create sequence if not exists public.sync_rows_seq;

create table if not exists public.sync_rows (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  -- Server-assigned and always increasing: devices pull "everything after the
  -- last number I saw", so phone and laptop clocks never need to agree.
  server_seq bigint      not null default nextval('public.sync_rows_seq'),
  primary key (user_id, tbl, id)
);

create index if not exists sync_rows_user_seq on public.sync_rows (user_id, server_seq);

-- Give every insert and update a fresh sequence number.
create or replace function public.sync_rows_stamp() returns trigger
language plpgsql as $$
begin
  new.server_seq := nextval('public.sync_rows_seq');
  return new;
end $$;

drop trigger if exists sync_rows_stamp on public.sync_rows;
create trigger sync_rows_stamp before insert or update on public.sync_rows
for each row execute function public.sync_rows_stamp();

-- Only the signed-in user can see or change their own rows.
alter table public.sync_rows enable row level security;

drop policy if exists "own rows: read" on public.sync_rows;
create policy "own rows: read" on public.sync_rows
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own rows: insert" on public.sync_rows;
create policy "own rows: insert" on public.sync_rows
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own rows: update" on public.sync_rows;
create policy "own rows: update" on public.sync_rows
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Push a batch of rows. A row only replaces the stored one if it is newer, so
-- an old offline edit can never overwrite a newer one from another device.
create or replace function public.push_rows(rows jsonb) returns integer
language plpgsql security invoker as $$
declare
  written integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.sync_rows as s (user_id, tbl, id, data, updated_at, deleted)
  select auth.uid(),
         r->>'tbl',
         r->>'id',
         r->'data',
         (r->>'updated_at')::timestamptz,
         coalesce((r->>'deleted')::boolean, false)
  from jsonb_array_elements(rows) as r
  on conflict (user_id, tbl, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
    where s.updated_at < excluded.updated_at;
  get diagnostics written = row_count;
  return written;
end $$;

revoke all on function public.push_rows(jsonb) from public, anon;
grant execute on function public.push_rows(jsonb) to authenticated;
