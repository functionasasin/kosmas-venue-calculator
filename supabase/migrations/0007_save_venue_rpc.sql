-- supabase/migrations/0007_save_venue_rpc.sql
--
-- Replaces the client's two-call save. VenueDetail previously did
-- `await saveVenue(v)` then `await saveLines(...)` as independent writes, and
-- saveLines itself was a DELETE followed by a separate INSERT — so a failure
-- between them left a venue with updated inputs and no materials list.
--
-- security invoker: statements inside execute as the calling role, so the
-- existing 0002_rls.sql policies remain the only permission boundary. This
-- function adds atomicity, never authority. `authenticated` does not own the
-- tables and has no BYPASSRLS, so there is no escape.
create or replace function save_venue(
  p_venue jsonb,
  p_lines jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security invoker
set search_path = public as $$
declare
  v_id      uuid := (p_venue ->> 'id')::uuid;
  v_current timestamptz;
begin
  -- FOR UPDATE holds the row for the transaction, so two concurrent saves
  -- serialize: under READ COMMITTED the second blocks, re-reads the newly
  -- committed tuple, and correctly conflicts.
  select updated_at into v_current from venues where id = v_id for update;
  if not found then
    raise exception 'venue_not_found' using errcode = 'PT404';
  end if;

  -- null means "I have no baseline" and skips the check. The app always sends
  -- one; the DEFAULT exists so that a caller omitting the argument resolves to
  -- this function at all — PostgREST matches on the exact set of argument
  -- names and would otherwise answer PGRST202, not treat it as null.
  if p_expected_updated_at is not null
     and v_current is distinct from p_expected_updated_at then
    raise exception 'venue_conflict' using errcode = 'PT409';
  end if;

  update venues set
    name               = p_venue ->> 'name',
    courts             = (p_venue ->> 'courts')::int,
    tier               = p_venue ->> 'tier',
    security_cameras   = (p_venue ->> 'security_cameras')::int,
    kisi_doors         = (p_venue ->> 'kisi_doors')::int,
    extended_retention = (p_venue ->> 'extended_retention')::boolean,
    backup_internet    = (p_venue ->> 'backup_internet')::boolean
  where id = v_id;

  delete from venue_lines where venue_id = v_id;

  -- Delete-then-insert is kept deliberately: inside one transaction it is
  -- already correct, and reconciling by id would first require reworking the
  -- placeholder `new:${roleKey}` ids that mergeRecalculation mints. Line ids
  -- therefore churn on every save — harmless while audit is venue-level.
  insert into venue_lines
    (venue_id, item_id, qty, qty_tbd, origin_role_key,
     sort_order, source, suppressed, note)
  select v_id, (l ->> 'item_id')::uuid, (l ->> 'qty')::int,
         (l ->> 'qty_tbd')::boolean, l ->> 'origin_role_key',
         (l ->> 'sort_order')::int, l ->> 'source',
         (l ->> 'suppressed')::boolean, l ->> 'note'
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l;

  return jsonb_build_object(
    'venue', (select to_jsonb(v) from venues v where v.id = v_id),
    -- role_key is JOINED IN, not read off the row. venue_lines has NO role_key
    -- column — only origin_role_key — and listLines derives it via
    -- `select('*, items(role_key)')`. A bare to_jsonb(l) returns lines whose
    -- roleKey parses to null, mergeRecalculation then finds no counterpart for
    -- any formula line, and "a formula line with no fresh counterpart is
    -- dropped" wipes the entire BOM on the next Recalculate.
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) || jsonb_build_object('role_key', i.role_key)
                       order by l.sort_order)
      from venue_lines l
      join items i on i.id = l.item_id
      where l.venue_id = v_id), '[]'::jsonb)
  );
end $$;

-- Postgres grants EXECUTE to PUBLIC by default. Harmless in effect — the RLS
-- policies are `to authenticated`, so an anon caller reads zero rows and gets
-- PT404 — but "RLS is the only boundary" should be true, not merely
-- unexploitable.
revoke execute on function save_venue(jsonb, jsonb, timestamptz) from public;
grant  execute on function save_venue(jsonb, jsonb, timestamptz) to authenticated;
