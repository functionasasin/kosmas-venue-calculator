-- The catalog columns an anonymous visitor may read.
--
-- The Catalog SCREEN has always been admin-gated. The items TABLE never was:
-- 0002 grants select to any signed-in user, and VenueDetail loads the whole
-- catalog — inactive rows included — because every line in a materials list is
-- a role key that must resolve to a real SKU with a name, PoE watts and rack U,
-- and resolveCatalog needs the losing candidates to know a role is contested.
--
-- Removing the login does not change what listItems asks for. It changes who is
-- holding the browser. On 2026-08-26 production carried a supplier on 24 of 38
-- items (Drextech, Lazada, Apple, flic.io, Shopee/Lazada) and stock counts in
-- notes ("8 units on hand ... 6 more pending for its 14 courts"). Neither field
-- is rendered outside ItemForm, which is admin-only — they would simply ship in
-- the JSON to anyone who opened devtools.
--
-- COLUMNS ONLY, NEVER ROWS. Excluding the cabling categories from this view
-- looks like it would make the cabling gate a real boundary rather than a UI
-- gate. It would instead break the product: cables.ts emits cable lines for
-- every venue, they would resolve to no item, and saveVenueAndLines' unresolved
-- check would make every anonymous venue unsaveable. The cabling gate stays a
-- UI gate and says so in MaterialsTable's comment.
--
-- Inactive rows are included for the same reason listItems(true) exists: a
-- saved line whose SKU was retired still has to render with its name and the
-- (inactive) badge.
--
-- security_invoker is deliberately NOT set, so this view runs as its OWNER and
-- does not inherit items' `to authenticated` policy. That is the entire
-- mechanism by which anon gets rows. Supabase's linter flags this as
-- security_definer_view; it is intended, not an oversight, and "fixing" it to
-- security_invoker silently returns anon to zero rows. Same shape of pre-empted
-- lint as 0006's `set search_path = public`.
--
-- Two conditions this depends on, neither of them obvious from here:
--   - the view's owner (postgres, via `supabase db query --linked`) also owns
--     items, which 0001 created the same way
--   - 0002 does `enable row level security` WITHOUT `force`, and a table's
--     owner is exempt from non-forced RLS
-- `alter table items force row level security` would therefore return anon to
-- zero rows with nothing on screen pointing here.
begin;

-- `create view`, not `create or replace`: replace cannot drop or reorder
-- columns, so any future change to the column list needs an explicit
-- `drop view items_public;` first. This file is not re-runnable as-is.
create view items_public as
  select id,
         name,
         category,
         role_key,
         poe_watts,
         mains_watts,
         rack_u,
         is_active,
         is_default,
         print_note
    from items;

-- REVOKE FIRST. Supabase sets `alter default privileges ... grant all on tables
-- to anon, authenticated, service_role` in `public`, and default privileges
-- cover VIEWS. This view is auto-updatable — one FROM entry, no joins, no
-- DISTINCT/GROUP BY, every select-list entry a bare column — so under DEFINER
-- semantics an INSERT/UPDATE/DELETE through it rewrites onto `items` with the
-- OWNER's rights, straight past `items writable by admin only`. Creating it
-- with only a grant left anon holding DELETE/INSERT/UPDATE/TRUNCATE; verified
-- live on 2026-08-26 and closed the same day. Same hazard as EXECUTE-to-PUBLIC
-- on functions, which 0007:82-87 and 0011:105-109 already revoke correctly.
revoke all on items_public from public, anon, authenticated;

-- anon is the point. authenticated is granted too because §1.1 of the design
-- inverts App.tsx's routing in a later phase, after which a signed-in admin can
-- mount VenueDetail before getSession() resolves and would read the view. That
-- cannot happen today — App.tsx gates the whole tree on `loading` — so the
-- grant is for the phase after next, not for a current failure mode. The read
-- is harmless either way: VenueDetail renders neither supplier nor notes.
grant select on items_public to anon, authenticated;

-- What actually keeps anon out of `items` is RLS, NOT a withheld grant. Supabase's
-- default privileges already grant on every relation in `public`, so anon holds
-- SELECT on `items` and simply matches no row — 0002's policies are scoped
-- `to authenticated`. That is why an anon read of `items` returns [] rather than
-- 42501. Two consequences worth keeping straight: on the BASE TABLES, RLS is the
-- only barrier; on THIS VIEW, which has no RLS of its own, the revoke above is
-- the only barrier. The venues, venue_lines and venue_item_choices policies also
-- stay `to authenticated` — that, not application code, is what keeps admin
-- venues invisible to anon.

-- The linter finding is read in the Supabase dashboard, where nobody sees this
-- file. Put the reason where the warning appears — the same instinct as 0006
-- putting `set search_path` in the function body rather than only in prose.
comment on view items_public is
  'Narrowed catalog for anonymous readers: no supplier, no notes. Definer semantics are deliberate — they are what returns rows without a session. Do NOT set security_invoker = true, and do not grant more than SELECT; see 0017.';

-- A newly created view is invisible to PostgREST until it reloads its schema
-- cache. Supabase's DDL event trigger usually does this within seconds, but it
-- lags often enough that the first curl comes back PGRST205/404 and reads as a
-- failed migration.
notify pgrst, 'reload schema';

commit;
