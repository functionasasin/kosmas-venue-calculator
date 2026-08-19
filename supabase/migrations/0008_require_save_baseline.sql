-- The optimistic lock in 0007 FAILED OPEN: `p_expected_updated_at` defaults to
-- null and the check was `if ... is not null`, so a caller that omitted the
-- baseline silently skipped the concurrency check and overwrote unconditionally.
--
-- That was only ever safe while the client could not drop the field, and it can:
-- `venueFromRow` maps `r.updated_at as string` from a `Record<string, unknown>`,
-- so a column rename or a typo compiles fine, yields `updatedAt: undefined`,
-- supabase-js omits the key from the JSON body, PostgREST resolves the two-arg
-- form via the default, and every save overwrites with no error anywhere.
--
-- A concurrency guard that disappears quietly is worse than none, because the
-- UI still tells the user they are protected. It now fails LOUD instead. The
-- default is kept so an omitted argument still resolves to this function and
-- raises, rather than returning PGRST202 from PostgREST's resolver.
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
  if p_expected_updated_at is null then
    raise exception 'venue_baseline_required' using errcode = 'PT400';
  end if;

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

  return jsonb_build_object(
    'venue', (select to_jsonb(v) from venues v where v.id = v_id),
    -- role_key is JOINED IN: venue_lines has no role_key column, and lines
    -- returned without one make mergeRecalculation drop every formula line.
    'lines', coalesce((
      select jsonb_agg(to_jsonb(l) || jsonb_build_object('role_key', i.role_key)
                       order by l.sort_order)
      from venue_lines l
      join items i on i.id = l.item_id
      where l.venue_id = v_id), '[]'::jsonb)
  );
end $$;
