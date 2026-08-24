-- save_venue gains the venue's hardware choices, in the same transaction as
-- the lines.
--
-- Writing them through a separate PostgREST call would undo three guarantees
-- at once:
--   * split write — choices commit, lines fail, and a venue's pinned camera
--     disagrees with its venue_lines.item_id. That divergence is what 0007 was
--     written to eliminate.
--   * lock bypass — stamp_venue (0006) fires on `venues` only, so a
--     choice-only write bumps no updated_at and a second editor's stale
--     baseline still passes the conflict check.
--   * permanent dirty state — runSave rebuilds its saved snapshot from this
--     function's return value, so choices absent from it read as unsaved
--     forever.
--
-- PostgREST resolves overloads by the EXACT set of argument names, so this is
-- a new function plus a client update in lockstep, never an in-place edit.
--
-- The 3-argument form is dropped rather than left beside it. Nothing calls it
-- after the client update, and leaving it would be a second write path into
-- `venues` that silently ignores choices — the same trap that made saveVenue
-- insert-only. The cost is that a browser tab still running an older build
-- fails its next save with PGRST202 instead of writing a venue whose choices
-- are stale; that is the better failure.
drop function if exists save_venue(jsonb, jsonb, timestamptz);

create or replace function save_venue(
  p_venue jsonb,
  p_lines jsonb,
  p_choices jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security invoker
set search_path = public as $$
declare
  v_id      uuid := (p_venue ->> 'id')::uuid;
  v_current timestamptz;
begin
  -- The lock must fail LOUD, never open. See 0008: a caller that drops the
  -- baseline used to skip the concurrency check entirely.
  if p_expected_updated_at is null then
    raise exception 'venue_baseline_required' using errcode = 'PT400';
  end if;

  -- FOR UPDATE holds the row for the transaction, so two concurrent saves
  -- serialize: under READ COMMITTED the second blocks, re-reads the newly
  -- committed tuple, and correctly conflicts.
  select updated_at into v_current from venues where id = v_id for update;
  if not found then
    raise exception 'venue_not_found' using errcode = 'PT404';
  end if;

  if v_current is distinct from p_expected_updated_at then
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

  insert into venue_lines
    (venue_id, item_id, qty, qty_tbd, origin_role_key,
     sort_order, source, suppressed, note)
  select v_id, (l ->> 'item_id')::uuid, (l ->> 'qty')::int,
         (l ->> 'qty_tbd')::boolean, l ->> 'origin_role_key',
         (l ->> 'sort_order')::int, l ->> 'source',
         (l ->> 'suppressed')::boolean, l ->> 'note'
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l;

  -- Same delete-then-insert shape as the lines, and correct for the same
  -- reason: it is one transaction. The client sends the venue's FULL choice
  -- set every save, so an omitted role is a deliberate removal.
  delete from venue_item_choices where venue_id = v_id;

  insert into venue_item_choices (venue_id, role_key, item_id)
  select v_id, c ->> 'role_key', (c ->> 'item_id')::uuid
  from jsonb_array_elements(coalesce(p_choices, '[]'::jsonb)) as c;

  return jsonb_build_object(
    'venue', (select to_jsonb(v) from venues v where v.id = v_id),
    -- role_key is JOINED IN: venue_lines has no role_key column, and lines
    -- returned without one make mergeRecalculation drop every formula line.
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) || jsonb_build_object('role_key', i.role_key)
                       order by l.sort_order)
      from venue_lines l
      join items i on i.id = l.item_id
      where l.venue_id = v_id), '[]'::jsonb),
    -- Returned so runSave's saved snapshot includes them. Without this the
    -- venue reads as dirty forever the moment it has any choice at all.
    'choices', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.role_key)
      from venue_item_choices c where c.venue_id = v_id), '[]'::jsonb)
  );
end $$;

revoke execute on function save_venue(jsonb, jsonb, jsonb, timestamptz) from public;
grant  execute on function save_venue(jsonb, jsonb, jsonb, timestamptz) to authenticated;
