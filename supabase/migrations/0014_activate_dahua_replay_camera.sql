-- Two active replay cameras, which the catalog could not hold until 0011.
--
-- Kosmas does not deploy one replay camera: Tela Park runs the Uniview Owlview
-- at 2.8 W, and Helios Beta (14 courts, Pro) is being built with the Dahua at
-- 17.5 W. At 14 courts that is a full UPS rung — 406 W / 1000 VA against
-- 612 W / 1500 VA — so the tool was wrong for one of them whichever single
-- camera the catalog held.
--
-- REPLACES 0010, which was deleted unapplied. That migration deactivated the
-- Uniview in order to activate the Dahua; this one activates the Dahua
-- alongside it, which is the either/or being removed.
--
-- 17.5 W is the datasheet MAXIMUM CONSUMPTION. The camera's input rating is
-- 12V/2A (= 24 W) or 802.3at (up to 25.5 W at the PD); both are envelope
-- figures for what the supply can deliver, neither is a draw figure. Sizing on
-- 24 W would cost a rung at 14 courts and put the PoE budget at 86% where it
-- is really 71%. The one thing that would make 24 W honest is the Smart Dual
-- Light illuminator — which is why "set illumination to IR, not white/dual" is
-- a print_note and load-bearing for this number, not a picture preference.
--
-- This runs once, against live production data, with no rollback path, so the
-- `update` moved inside the `do $$` block below rather than staying a bare
-- statement up here: the name predicate is a `like` with no uniqueness
-- guarantee, and a second row matching it (a 2712 vs. a 2812 variant, say)
-- would activate silently and put an unintended SKU into every venue's picker
-- permanently. Asserting "exactly one match" has to happen BEFORE the update
-- runs, not after, or the damage is already done by the time anything checks.
do $$
declare
  v_match_count int;
  v_default uuid;
begin
  select count(*) into v_match_count
  from items where name like '%IPC-HDW5459T-ZE-IL%';

  if v_match_count <> 1 then
    raise exception
      'name predicate %%IPC-HDW5459T-ZE-IL%% matched % row(s), expected exactly 1',
      v_match_count;
  end if;

  update items set
    is_active = true,
    role_key  = 'replay_camera',
    -- NOT the default. The Uniview keeps it, so a venue that has not chosen
    -- is sized exactly as it was before this migration ran.
    is_default = false,
    notes = 'PodPlay''s Option-1 primary standard and what Helios Beta is being '
            'built with — 8 units on hand (recorded 2026-08-18), 6 more pending '
            'for its 14 courts. 4MP 1/1.8", 2.7-12mm motorized varifocal, Smart '
            'Dual Light, 802.3at. 17.5W MAX / 5W typical — the budget needs max. '
            'The 12V/2A input rating is a 24W supply envelope, NOT a draw '
            'figure; do not put it here. Active ALONGSIDE the Uniview: venues '
            'pick per venue (venue_item_choices).',
    print_note = 'Set illumination mode to IR, NOT white/dual. This is a power constraint as well as a picture one: with the white LED enabled this family draws toward 24W, which changes both the switch PoE budget and the UPS rating.'
  where name like '%IPC-HDW5459T-ZE-IL%';

  if not exists (select 1 from items where name like '%IPC-HDW5459T-ZE-IL%'
                   and is_active and role_key = 'replay_camera') then
    raise exception 'the Dahua row was not activated — check the name predicate';
  end if;

  -- Every EXISTING venue is pinned to the Uniview in the same transaction
  -- that creates the alternative. A choice row exists if and only if the role
  -- has ever had more than one active item — otherwise whether a venue is
  -- protected from a later default flip would depend on whether someone
  -- happened to save it, which is not a rule anyone can reason about.
  --
  -- This precondition is asserted rather than assumed. A missing default
  -- would make the insert below a plain CROSS JOIN LATERAL that yields zero
  -- rows for EVERY venue, and the migration would "succeed" having pinned
  -- nobody — criterion 4 rests entirely on this insert.
  select id into v_default from items
  where role_key = 'replay_camera' and is_active and is_default;

  if v_default is null then
    raise exception 'replay_camera has no active default to pin venues to';
  end if;

  insert into venue_item_choices (venue_id, role_key, item_id)
  select v.id, 'replay_camera', v_default from venues v
  on conflict (venue_id, role_key) do nothing;
end $$;
