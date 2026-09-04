-- Take the inventory COUNTS out of items.notes, keeping the reasoning.
--
-- `items` has no quantity column and never has — the Catalog's only numeric
-- columns are power and rack U — so a stock figure had nowhere legitimate to
-- live and ended up in the one free-text field that would accept it. The spec
-- rules this out directly: § 13 Out of scope, "Inventory integration
-- (kosmas-inventory.md stays separate)". Inventory is a different document in
-- a different repo.
--
-- The reason this is worth a migration rather than a shrug is that the numbers
-- DECAY and nothing updates them. "8 units on hand (recorded 2026-08-18)" was
-- already two and a half weeks stale when this was written, and a count in a
-- field nobody maintains is worse than no count at all: it reads as current.
-- The date stamp is the tell — whoever wrote it knew, and stamped it instead
-- of leaving it out.
--
-- Both notes were doing two jobs. The qualitative half is kept, because it is
-- what `notes` is for and it is load-bearing:
--   * "the stocked replay camera" is WHY the Uniview holds the role default
--   * "what Helios Beta is being built with" is WHY the Dahua is in the
--     catalog at all (0014 activated it alongside the Uniview)
-- Only the counts go. Nothing that explains a decision is lost.
--
-- Secondary benefit, not the reason: supabase/seed/0003_catalog_seed.sql and
-- 0014 are in a PUBLIC repo, so these two figures were readable by anyone.
-- Trimming them here and in those files cleans the current tree, but NOT git
-- history — the old blobs stay reachable, and a rebase-merged PR keeps a
-- second copy under refs/pull/N/head. This does not retract what is already
-- published; it stops it being restated.
--
-- `print_note` is untouched: neither camera's printed note ever carried a
-- count, which is right — a stock level is not something the buyer acts on.

-- On the assertions below: this migration must be a NO-OP on a from-scratch
-- rebuild. 0003 (seed) and 0014 have both been trimmed at source, so replaying
-- the whole chain produces notes that already have no counts in them and
-- there is nothing here left to change. An earlier draft asserted "exactly one
-- row updated each" and would therefore have ABORTED a clean rebuild.
--
-- The invariant is what to assert, not the row count: afterwards, no item may
-- carry an inventory count. That covers the drift case 0014 taught us about —
-- if a predicate silently matches nothing while the count is still in the
-- text, the leftover check still fails — and it stays true whether this runs
-- against production or against a database that was never dirty.
do $$
declare
  leftover int;
  cameras  int;
begin
  -- replace(), not a wholesale rewrite of the note. A full re-set would
  -- silently discard any edit made through ItemForm since 0014 ran, and the
  -- point here is to remove one clause, not to reassert the whole text.
  update items set notes = replace(
    notes,
    ' — 8 units on hand (recorded 2026-08-18), 6 more pending for its 14 courts.',
    '.'
  )
  where role_key = 'replay_camera'
    and name like '%IPC-HDW5459T-ZE-IL%'
    and notes like '%units on hand%';

  -- The Uniview's count sits inside a parenthetical that also carries a fact
  -- worth keeping — the Tela Park rig — so the clause is rebuilt rather than
  -- deleted.
  update items set notes = replace(
    notes,
    'The stocked replay camera (10 on hand; the unit on the Tela Park rig).',
    'The stocked replay camera, and the unit on the Tela Park rig.'
  )
  where role_key = 'replay_camera'
    and name like '%IPC3624LE-ADF28K-WP%'
    and notes like '%10 on hand%';

  -- Both camera rows must still be here. Without this, a rebuild in which the
  -- name predicates matched nothing — a renamed SKU, say — would sail through
  -- the leftover check below on an empty result and report a clean sweep of a
  -- catalog it never touched.
  select count(*) into cameras
  from items
  where name like '%IPC-HDW5459T-ZE-IL%' or name like '%IPC3624LE-ADF28K-WP%';

  if cameras <> 2 then
    raise exception
      'expected both replay cameras to exist, found % — check the name predicates before trusting the sweep',
      cameras;
  end if;

  -- The invariant. Not "did I change two rows" but "is any count left", which
  -- holds equally on a dirty production database and on a clean rebuild, and
  -- still catches a predicate that missed while the text is really there. If
  -- someone has added a THIRD such note since, this fails rather than
  -- reporting a sweep it did not do.
  select count(*) into leftover
  from items
  where notes ~* '(on hand|in stock|[0-9]+ +units|more pending)';

  if leftover <> 0 then
    raise exception
      '% row(s) still carry an inventory count in notes — trim them too',
      leftover;
  end if;
end $$;
