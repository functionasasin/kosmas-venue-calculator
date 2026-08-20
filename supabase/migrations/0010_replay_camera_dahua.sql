-- Make the Dahua the catalog's active replay camera.
--
-- SPLIT OUT OF 0009 AND NOT YET APPLIED. This is deliberately separate because
-- it is not part of UPS sizing and it changes what EVERY venue is sized against,
-- including Tela Park, which runs the Uniview. The UPS work stands without it.
--
-- The change itself:
--
-- The catalog held the Uniview Owlview at 2.8W; Helios Beta (14 courts, Pro)
-- is being built with the Dahua batch recorded in kosmas-inventory.md. That is
-- a one-rung difference for that venue — 2.8W gives 1000 VA, 17.5W gives 1500.
--
-- 17.5W is the datasheet MAXIMUM CONSUMPTION. The camera's input rating is
-- 12V/2A (= 24W) or 802.3at (up to 25.5W at the PD); both are envelope figures
-- for what the supply can deliver and neither is a draw figure. Sizing on 24W
-- would cost a rung at 14 courts and put the PoE budget at 86% where it is
-- really 71%. The one thing that would make 24W honest is the Smart Dual Light
-- illuminator — the inventory doc's "set illumination to IR, not white/dual"
-- step is therefore load-bearing for this number, not a picture preference.
--
-- The replay camera is NOT standardised across venues (Tela Park runs Uniview),
-- so if a venue ships on a different unit this row is what has to change — the
-- engine reads it rather than hard-coding, and warns when the rung it produces
-- differs from the one PodPlay's 17.5W standard would give.
--
-- Order matters: items_role_key_active is unique over active rows, so the
-- incumbent must be deactivated before the replacement claims the key.
update items set is_active = false, role_key = null,
  notes = 'Bench-tested and running at Tela Park (8 units, 2.8W max, 802.3af). '
          'Stood down as the catalog default 2026-08-20 in favour of the Dahua '
          'batch going into Helios Beta. Uses the Uniview RTSP path '
          '/unicast/c1/s0/live, NOT the Dahua /cam/realmonitor. Reactivate by '
          'deactivating the Dahua FIRST — the role key is unique over active rows.'
where role_key = 'replay_camera' and name like 'Uniview%';

update items set is_active = true, role_key = 'replay_camera',
  name = 'Dahua DH-IPC-HDW5459T-ZE-IL-2712 (Replay Camera)',
  notes = 'PodPlay''s Option-1 primary standard. 8 units on hand (recorded '
          '2026-08-18), 6 more pending for Helios Beta''s 14 courts. 4MP '
          '1/1.8", 2.7-12mm motorized varifocal, Smart Dual Light, 802.3at. '
          '17.5W MAX / 5W typical — the budget needs max. The 12V/2A input '
          'rating is a 24W supply envelope, NOT a draw figure; do not put it '
          'here.',
  print_note = 'Set illumination mode to IR, NOT white/dual. This is a power constraint as well as a picture one: with the white LED enabled this family draws toward 24W, which changes both the switch PoE budget and the UPS rating.'
where name like '%IPC-HDW5459T-ZE-IL%' and is_active = false;
