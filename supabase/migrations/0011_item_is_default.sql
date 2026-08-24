-- Relaxes "one ACTIVE item per role key" to "one DEFAULT active item per role
-- key", so a role can hold several active items and a venue can pick among
-- them (venue_item_choices, 0012). The invariant is not removed — it moves
-- from the database into resolveCatalog, which re-establishes it in memory
-- before the engine, the sections code or the PDF ever see the catalog.
--
-- Four things ship together because the column is unusable without them: the
-- flag, a safe way to move it, and a trigger that clears it when the row it
-- sits on stops being active.

alter table items add column is_default boolean not null default false;

-- Preserves the pre-migration state exactly: whatever was active and holding a
-- role key WAS that role's item, so it becomes that role's default.
update items set is_default = true where is_active and role_key is not null;

drop index items_role_key_active;

-- Uniqueness, not existence. A role key may now have several active items and
-- NO default — reachable by deactivating the current default, and through the
-- Catalog form, which creates items with is_default = false. resolveCatalog
-- reports that state as ROLE_NO_DEFAULT rather than picking arbitrarily.
create unique index items_role_key_default
  on items (role_key) where (is_active and is_default and role_key is not null);

-- Deactivation clears the flag, and it is a TRIGGER rather than application
-- code on purpose. setItemActive is not the only path that deactivates an
-- item: 0009 retired the KSTAR with raw SQL, and any future migration or
-- `supabase db query` call can do the same. A rule living only in
-- data/items.ts would be bypassed by exactly the operations most likely to
-- leave a role defaultless. Same enforcement shape as stamp_venue in 0006.
--
-- `set search_path = public` is not optional hygiene — without it the function
-- resolves through the caller's search_path, which Supabase's linter flags as
-- function_search_path_mutable.
create or replace function items_clear_default_on_deactivate() returns trigger
language plpgsql security invoker
set search_path = public as $$
begin
  if old.is_active and not new.is_active then
    new.is_default := false;
  end if;
  return new;
end $$;

-- The WHEN clause makes the intent readable from \d items and skips the
-- function call on every unrelated update.
create trigger items_clear_default
  before update on items
  for each row when (old.is_active and not new.is_active)
  execute function items_clear_default_on_deactivate();

-- Moving the default cannot be two PostgREST round trips: clearing then
-- setting leaves a window where the role has no default, and the other order
-- is rejected outright by items_role_key_default.
--
-- It is TWO STATEMENTS inside one function, and that distinction matters.
-- Postgres checks a non-deferrable unique index per ROW, as each new heap
-- tuple is inserted — which is why `update t set i = i + 1` fails on a unique
-- column even though the final state is unique. A single
-- `set is_default = (id = p_item_id)` over both rows therefore succeeds or
-- fails on physical scan order: it works when the incumbent happens to be
-- updated first and raises a duplicate-key error when it does not. A partial
-- index cannot be declared DEFERRABLE, so there is no version of the one-
-- statement form that is safe.
--
-- Two statements in one function are still atomic — the function is one
-- transaction, and no other session can observe the moment between them. The
-- window this comment used to worry about only exists across round trips.
--
-- security invoker: the items RLS policy already restricts writes to admins,
-- and this function adds atomicity, never authority. A non-admin's UPDATE
-- matches zero rows, which is why the `not found` check is here — silently
-- doing nothing is the failure mode this repo keeps designing out.
create or replace function set_item_default(p_item_id uuid) returns void
language plpgsql security invoker
set search_path = public as $$
declare
  v_active boolean;
  v_role   text;
begin
  select is_active, role_key into v_active, v_role from items where id = p_item_id;
  if v_active is null then
    raise exception 'item_not_found' using errcode = 'PT404';
  end if;
  if not v_active then
    raise exception 'item_inactive' using errcode = 'PT400';
  end if;
  if v_role is null then
    raise exception 'item_has_no_role_key' using errcode = 'PT400';
  end if;

  update items set is_default = false
  where role_key = v_role and is_active and is_default and id <> p_item_id;

  update items set is_default = true where id = p_item_id;

  -- The second statement is the one that must have written. Zero rows here is
  -- RLS refusing the write, which PostgREST otherwise reports as success.
  if not found then
    raise exception 'item_default_not_updated' using errcode = 'PT403';
  end if;
end $$;

-- Postgres grants EXECUTE to PUBLIC by default. Harmless in effect — RLS still
-- rejects the write — but "RLS is the only boundary" should be true, not merely
-- unexploitable. Same reasoning as 0007's revoke.
revoke execute on function set_item_default(uuid) from public;
grant  execute on function set_item_default(uuid) to authenticated;
