-- Seeded from docs/kosmas-inventory.md and the SKUs named in
-- docs/podplay-ph-venue-sizing.md (both in the Kosmas Setup repo).
--
-- Every poe_watts is MAXIMUM draw, not typical. The PoE budget check rests on
-- these numbers. Where a figure is unknown, leave it null: the calculator
-- raises POE_DATA_INCOMPLETE rather than silently under-counting.
--
-- Every mains_watts is likewise MAXIMUM draw, EXCLUDING any PoE the device
-- hands out. The two columns are disjoint and feed different budgets: poe_watts
-- feeds the switch PoE check, mains_watts feeds UPS sizing. A switch has both.
--
-- NOTE: the replay camera is NOT standardised across venues, and after
-- migration 0014 the catalog no longer has to choose — BOTH cameras are
-- active, the Uniview Owlview (2.8W, Tela Park) is the role's DEFAULT, the
-- Dahua (17.5W, Helios Beta) is the alternative, and each venue picks through
-- venue_item_choices. The gap is real: a 14-court venue is 1000 VA on the
-- Uniview and 1500 VA on the Dahua.
--
-- Names here are likewise the PRE-migration ones: 0016 strips "(Replay
-- Camera)" from the Dahua and "(Access Point)" from the U7-LR and asserts it
-- renamed exactly one row each, so those two must be seeded with the suffix
-- still on them or a from-scratch rebuild fails there. Only the SUFFIX has to
-- match — 0016 keys on role_key, not on the full name — so a future rename of
-- either SKU does not have to be mirrored here to keep the migration working.
--
-- The Dahua's name was separately aligned to the live row on 2026-08-25: this
-- file had it as "Dahua DH-IPC-HDW5459T-ZE-IL-2712", production as
-- "EmpireTech / Dahua IPC-HDW5459T-ZE-IL", and 0014's `like` predicate matched
-- both, which is how the two drifted unnoticed. Production is also what
-- podplay-ph-venue-sizing.md § Option 1 calls the camera; the "-2712" is the
-- lens designation kosmas-inventory.md uses for the units on the shelf.
--
-- This file is deliberately NOT that end state. It runs as 0003, under
-- 0001's items_role_key_active index, so a second active replay camera here
-- would fail the bootstrap. 0011 relaxes the index and backfills is_default;
-- 0014 activates the Dahua and pins existing venues. Run in order, a new
-- project lands where production lands. Migration 0010 used to flip the two
-- cameras instead; it was deleted unapplied.
--
-- Prices are deliberately absent. They are entered through the admin catalog
-- form and never leave it.

insert into items (name, category, role_key, supplier, poe_watts, rack_u, notes, print_note) values
  ('Uniview IPC3624LE-ADF28K-WP (Owlview)', 'camera', 'replay_camera', 'Drextech', 2.8, 0, 'The stocked replay camera, and the unit on the Tela Park rig. 4MP 2.8mm fixed, 802.3af, 2.8W MAX — bench-tested, RTSP VLC-verified. Uses the Uniview RTSP path /unicast/c1/s0/live, NOT the Dahua /cam/realmonitor.', null),
  ('Security Camera — SKU not yet selected', 'camera', 'security_camera', null, 7, 0, 'PLANNING FIGURE, NOT A SPEC. No PH SKU has been chosen. 7W is the sizing doc''s max-draw estimate for the 802.3af G5 class. If PH picks a PoE+ part this roughly doubles and every Autonomous+ UPS rung must be recomputed. Do NOT fill this with one of the Dahua / EmpireTech / Uniview cameras in the docs — those are all REPLAY cameras, and reading one onto this line inflates every Autonomous+ figure. Autonomous+ only; ships from US/HK.', null),
  ('iPad (A16) 128GB', 'court', 'ipad', 'Apple', null, 0, null, null),
  ('PoE to USB-C Adapter (802.3af, 12W)', 'court', 'ipad_poe_adapter', 'Shopee/Lazada', 13, 0, 'Must do power AND data over USB-C. Do NOT substitute the 25W UACC-PoE+-USBC on dense venues.', null),
  ('iPad Locking Wall Mount', 'court', 'ipad_wall_mount', null, null, 0, null, null),
  ('Apple TV 4K (Wi-Fi + Ethernet) 128GB', 'court', 'apple_tv', 'Apple', null, 0, 'Ethernet model required.', 'Ethernet (128GB) model — Wi-Fi-only units cannot sit on the wired REPLAY VLAN.'),
  ('Samsung 65" TV (U8000F)', 'court', 'display', null, null, 0, null, null),
  ('UniFi USW-Pro-24-PoE', 'network', 'switch_24_pro', 'Drextech', null, 1, '400W PoE budget.', null),
  ('UniFi USW-24-PoE', 'network', 'switch_24_std', 'Drextech', null, 1, 'Non-Pro branch; rarely fires in PH.', null),
  ('UniFi USW-Pro-48-PoE', 'network', 'switch_48_pro', 'Drextech', null, 1, '600W PoE budget.', null),
  ('UniFi Dream Machine SE', 'network', 'gateway_udm_se', 'Drextech', null, 1, null, null),
  ('UniFi Dream Machine Pro', 'network', 'gateway_udm_pro', 'Drextech', null, 1, null, null),
  ('UniFi U7-LR (Access Point)', 'network', 'access_point', 'Drextech', null, 0, 'VERIFY MAX PoE DRAW before relying on the budget check — U7-LR is 802.3at, and the sizing doc does not state a figure. Quantity is a coverage decision, never a formula output.', null),
  ('Cat6 24-Port Patch Panel', 'network', 'patch_panel_24', null, null, 1, 'Deliberately unbranded, 2026-08-13. Was the Zoerax Honi (Drextech) — a real product, but naming one SKU implies it is the only acceptable part. The coupler requirement below is what actually matters.', 'Cat6-rated (not Cat5e), 24 ports, 1U. MUST use pass-through couplers / coupler keystones — a punch-down panel is not a substitute, it needs a punch tool and a different termination process. FRONT ports patch to the switch; BACK terminates court runs.'),
  ('Cat6 48-Port Patch Panel', 'network', 'patch_panel_48', null, null, 1, 'Deliberately unbranded. Replaced the AD-LINK panel on 2026-08-11; matching the 24-port''s Zoerax family was the obvious move but no Zoerax 48-port was confirmed to exist, so the brand is a sourcing decision rather than a spec. PH deviation from 2x 24-port, which remains the fallback. Front + rear cable management bar if available — moved off the printed note 2026-08-24 as an optional accessory rather than a constraint.', 'Cat6-rated (not Cat5e), 48 ports, 1U. MUST be pass-through couplers / coupler keystones, not punch-down. FRONT ports patch to the switch; BACK terminates court runs. If no 48-port coupler panel is sourceable, 2x 24-port panels substitute cleanly at the cost of 1U.'),
  ('Vention Cat6 UTP 0.5M', 'cable', 'cat6_0m5', 'Lazada', null, 0, null, 'UTP, stranded, booted RJ45 — not shielded, not solid-core.'),
  ('Vention Cat6 UTP 1M', 'cable', 'cat6_1m', 'Lazada', null, 0, null, null),
  ('Vention Cat6 UTP 3M', 'cable', 'cat6_3m', 'Lazada', null, 0, null, null),
  ('Mac mini (M4)', 'compute', 'mac_mini', 'Apple', null, 0, 'Rack U is carried by the shelf line, so the pair is not double-counted.', null),
  ('1U Vented Shelf (Mac mini)', 'compute', 'mac_mini_shelf', null, null, 2, 'Doc lists mini-on-shelf as 2U combined.', null),
  ('Kingston XS1000 1TB', 'storage', 'replay_ssd_1tb', 'Lazada', null, 0, null, null),
  ('Kingston XS1000 2TB', 'storage', 'replay_ssd_2tb', 'Lazada', null, 0, '3D TLC. Family stops at 2TB.', null),
  ('Kingston XS2000 4TB', 'storage', 'replay_ssd_4tb', 'Lazada', null, 0, 'XS1000 has no 4TB; IP55 metal body.', null),
  ('UPS — 750 VA / 450 W minimum, 2U rack-mount', 'power', 'ups_750va', null, null, 2, 'Sizing rationale, moved off the printed note 2026-08-24 — the full version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, the pessimistic end of line-interactive; an online double-conversion unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and PH sellers use both, often in the same listing. AVR matters because PH mains are noisy enough to need buck/boost. Capacity is not runtime — confirm runtime separately if the venue needs graceful shutdown.', 'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same watts a rung lower. Line-interactive with AVR minimum, never standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.'),
  ('UPS — 1000 VA (1 kVA) / 600 W minimum, 2U rack-mount', 'power', 'ups_1000va', null, null, 2, 'Sizing rationale, moved off the printed note 2026-08-24 — the full version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, the pessimistic end of line-interactive; an online double-conversion unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and PH sellers use both, often in the same listing. AVR matters because PH mains are noisy enough to need buck/boost. Capacity is not runtime — confirm runtime separately if the venue needs graceful shutdown.', 'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same watts a rung lower. Line-interactive with AVR minimum, never standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.'),
  ('UPS — 1500 VA (1.5 kVA) / 900 W minimum, 2U rack-mount', 'power', 'ups_1500va', null, null, 2, 'Sizing rationale, moved off the printed note 2026-08-24 — the full version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, the pessimistic end of line-interactive; an online double-conversion unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and PH sellers use both, often in the same listing. AVR matters because PH mains are noisy enough to need buck/boost. Capacity is not runtime — confirm runtime separately if the venue needs graceful shutdown.', 'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same watts a rung lower. Line-interactive with AVR minimum, never standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.'),
  ('UPS — 2000 VA (2 kVA) / 1200 W minimum, 2U rack-mount', 'power', 'ups_2000va', null, null, 2, 'Sizing rationale, moved off the printed note 2026-08-24 — the full version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, the pessimistic end of line-interactive; an online double-conversion unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and PH sellers use both, often in the same listing. AVR matters because PH mains are noisy enough to need buck/boost. Capacity is not runtime — confirm runtime separately if the venue needs graceful shutdown.', 'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same watts a rung lower. Line-interactive with AVR minimum, never standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.'),
  ('UPS — 3000 VA (3 kVA) / 1800 W minimum, 2U rack-mount', 'power', 'ups_3000va', null, null, 2, 'Top of the ladder. The stocked KSTAR MP RT 3K S is a 3000VA/2700W on-line unit and satisfies this rung with room to spare. Sizing rationale, moved off the printed note 2026-08-24 — the full version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, the pessimistic end of line-interactive; an online double-conversion unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and PH sellers use both, often in the same listing. AVR matters because PH mains are noisy enough to need buck/boost. Capacity is not runtime — confirm runtime separately if the venue needs graceful shutdown.', 'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same watts a rung lower. Line-interactive with AVR minimum, never standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.'),
  ('12U Network Rack Enclosure', 'rack', 'rack_12u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24". Rack-mount UPS units are typically 600mm deep — confirm the depth of the unit actually sourced.'),
  ('16U Network Rack Enclosure', 'rack', 'rack_16u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('21U Network Rack Enclosure', 'rack', 'rack_21u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('27U Network Rack Enclosure', 'rack', 'rack_27u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('Flic Button (Gen 2)', 'accessory', 'flic', 'flic.io', null, 0, null, null),
  ('Aluminum Printed Sign 6x8', 'signage', 'signage', null, null, 0, 'PH supplier not yet sourced.', null),
  ('Kisi Controller Pro 2', 'network', 'kisi_controller', null, null, null, 'Autonomous tiers only. Not stocked in PH — ships from US/HK. Sized 1 per 4 doors, which is the doc''s INTENT: Cost Analysis!F37 tests the empty cell Z16 instead of Z14, so the sheet returns 1 controller for every venue whatever the door count. rack_u is null on purpose — the source calls it rack-mounted but records no U figure, so the rack total excludes it and a warning says so.', 'Lands on a UDM RJ45 port, not the switch — non-PoE, 1 port per controller. Verify the rack bracket before ordering.'),
  ('Kisi Reader Pro 2.1', 'court', 'kisi_reader', null, 7, 0, 'Autonomous tiers only. Not stocked in PH — ships from US/HK. 1 per door. The 2.1, not the Pro 2: it adds Apple ECP 2.0 and offline support, and the PH Kisi supplier does not stock the older generation anyway. 7W max, 802.3af.', 'Goes on the UDM-SE''s PoE ports first, overflowing to the switch only when the gateway runs out. This is a deliberate Kosmas deviation — PodPlay''s guides put every reader on the switch. Tag each UDM port carrying a reader onto the ACCESS CONTROL VLAN.');

-- Alternates and retired hardware. Inactive, so they hold no role key and
-- reach no BOM. Until 0011 only one ACTIVE item could hold a role key at all;
-- after it, several can — but this file runs before that, so these stay
-- inactive here and 0014 is what activates the Dahua.
insert into items (name, category, role_key, supplier, poe_watts, rack_u, is_active, notes) values
  ('EmpireTech / Dahua IPC-HDW5459T-ZE-IL (Replay Camera)', 'camera', null, 'Drextech', 17.5, 0, false, 'PodPlay''s Option-1 primary standard and what Helios Beta is being built with. 4MP 1/1.8", 2.7-12mm motorized varifocal, Smart Dual Light, 802.3at, 17.5W MAX / 5W typical. The 12V/2A input rating is a 24W supply envelope, NOT a draw figure. Inactive HERE because this file runs under 0001''s index; 0014 activates it ALONGSIDE the Uniview, which keeps the role default, so a venue picks between them rather than the catalog choosing. 6x the Uniview''s draw — a full UPS rung at 14 courts. Set illumination to IR, not white/dual — that is what keeps 17.5W true.'),
  ('KSTAR MP RT 3K S UPS', 'power', null, 'Drextech', null, 2, false, 'RETIRED as a BOM line 2026-08-20 — the tool specs the UPS by VA rating now, not by SKU. Still the unit Kosmas stocks and installs: 3000VA/2700W on-line, i.e. the top rung, so it satisfies every venue. 600mm deep.');

-- Mains draw, verified against the manufacturers on 2026-08-20 rather than
-- taken from the source spreadsheet, which carries a flat 60W for every switch
-- and 30W for the Mac mini. Applied as updates so this block stays visibly
-- identical to the one in migrations/0009_ups_va_sizing.sql.
--
-- The Mac mini is the one the sheet gets wrong in the dangerous direction:
-- Apple's own table (support.apple.com/en-us/103253) gives the M4 as idle 4W /
-- max 65W, and this column is maxima.
update items set mains_watts = 50 where role_key in ('gateway_udm_se', 'gateway_udm_pro');
update items set mains_watts = 50 where role_key = 'switch_24_pro';
update items set mains_watts = 25 where role_key = 'switch_24_std';
update items set mains_watts = 60 where role_key = 'switch_48_pro';
update items set mains_watts = 20 where role_key = 'kisi_controller';
update items set mains_watts = 65 where role_key = 'mac_mini';
