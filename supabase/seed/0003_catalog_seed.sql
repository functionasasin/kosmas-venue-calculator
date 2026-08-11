-- Seeded from docs/kosmas-inventory.md and the SKUs named in
-- docs/podplay-ph-venue-sizing.md (both in the Kosmas Setup repo).
--
-- Every poe_watts is MAXIMUM draw, not typical. The PoE budget check rests on
-- these numbers, and the sizing doc's 427W densest-config figure only
-- reproduces with the replay camera's 17.5W max, not the 5W typical it also
-- quotes. Where a figure is unknown, leave it null: the calculator raises
-- POE_DATA_INCOMPLETE rather than silently under-counting.
--
-- Prices are deliberately absent. They are entered through the admin catalog
-- form and never leave it.

insert into items (name, category, role_key, supplier, poe_watts, rack_u, notes, print_note) values
  ('EmpireTech / Dahua IPC-HDW5459T-ZE-IL (Replay Camera)', 'camera', 'replay_camera', 'Drextech', 17.5, 0, 'Sizing doc primary pick. 802.3at, 17.5W MAX (5W typical — the budget needs max). Set illumination to IR, and Video Standard NTSC / Anti-Flicker 60Hz.', null),
  ('EmpireTech / Dahua IPC-HDW5459T-ZE-IL (Security Camera)', 'camera', 'security_camera', 'Drextech', 17.5, 0, 'Autonomous+ only.', null),
  ('iPad (A16) 128GB', 'court', 'ipad', 'Apple', null, 0, null, null),
  ('PoE to USB-C Adapter (802.3af, 12W)', 'court', 'ipad_poe_adapter', 'Shopee/Lazada', 13, 0, 'Must do power AND data over USB-C. Do NOT substitute the 25W UACC-PoE+-USBC on dense venues.', null),
  ('iPad Locking Wall Mount', 'court', 'ipad_wall_mount', null, null, 0, null, null),
  ('iPad Fence Mounting Bracket', 'court', 'ipad_fence_bracket', null, null, 0, 'Pickleball Kingdom only; otherwise specify manually.', null),
  ('Apple TV 4K (Wi-Fi + Ethernet) 128GB', 'court', 'apple_tv', 'Apple', null, 0, 'Ethernet model required.', 'Ethernet (128GB) model — Wi-Fi-only units cannot sit on the wired REPLAY VLAN.'),
  ('HDMI Cable', 'court', 'hdmi_cable', null, null, 0, null, null),
  ('Samsung 65" TV (U8000F)', 'court', 'display', null, null, 0, null, null),
  ('UniFi USW-Pro-24-PoE', 'network', 'switch_24_pro', 'Drextech', null, 1, '400W PoE budget.', null),
  ('UniFi USW-24-PoE', 'network', 'switch_24_std', 'Drextech', null, 1, 'Non-Pro branch; rarely fires in PH.', null),
  ('UniFi USW-Pro-48-PoE', 'network', 'switch_48_pro', 'Drextech', null, 1, '600W PoE budget.', null),
  ('UniFi Dream Machine SE', 'network', 'gateway_udm_se', 'Drextech', null, 1, null, null),
  ('UniFi Dream Machine Pro', 'network', 'gateway_udm_pro', 'Drextech', null, 1, null, null),
  ('UniFi U7-LR (Access Point)', 'network', 'access_point', 'Drextech', null, 0, 'VERIFY MAX PoE DRAW before relying on the budget check — U7-LR is 802.3at, and the sizing doc does not state a figure. Quantity is a coverage decision, never a formula output.', null),
  ('Zoerax Honi Cat6 24-Port Patch Panel', 'network', 'patch_panel_24', 'Drextech', null, 1, 'FRONT ports patch to the switch; BACK terminates court runs.', null),
  ('AD-LINK Cat6 48-Port Patch Panel', 'network', 'patch_panel_48', 'Drextech', null, 1, 'PH deviation from 2x 24-port.', null),
  ('Vention Cat6 UTP 0.5M', 'cable', 'cat6_0m5', 'Lazada', null, 0, null, 'UTP, stranded, booted RJ45 — not shielded, not solid-core.'),
  ('Vention Cat6 UTP 1M', 'cable', 'cat6_1m', 'Lazada', null, 0, null, null),
  ('Vention Cat6 UTP 3M', 'cable', 'cat6_3m', 'Lazada', null, 0, null, null),
  ('Mac mini (M4)', 'compute', 'mac_mini', 'Apple', null, 0, 'Rack U is carried by the shelf line, so the pair is not double-counted.', null),
  ('1U Vented Shelf (Mac mini)', 'compute', 'mac_mini_shelf', null, null, 2, 'Doc lists mini-on-shelf as 2U combined.', null),
  ('Kingston XS1000 1TB', 'storage', 'replay_ssd_1tb', 'Lazada', null, 0, null, null),
  ('Kingston XS1000 2TB', 'storage', 'replay_ssd_2tb', 'Lazada', null, 0, '3D TLC. Family stops at 2TB.', null),
  ('Kingston XS2000 4TB', 'storage', 'replay_ssd_4tb', 'Lazada', null, 0, 'XS1000 has no 4TB; IP55 metal body.', null),
  ('KSTAR MP RT 3K S UPS', 'power', 'ups', 'Drextech', null, 2, '3000VA/2700W on-line. Doc carries an open TODO to source a ~1600VA PH unit.', '230V-rated. 600mm deep — the rack must have >=610mm internal depth.'),
  ('12U Network Rack Enclosure', 'rack', 'rack_12u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24" to fit the KSTAR UPS.'),
  ('16U Network Rack Enclosure', 'rack', 'rack_16u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('21U Network Rack Enclosure', 'rack', 'rack_21u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('27U Network Rack Enclosure', 'rack', 'rack_27u', 'Drextech', null, 0, null, 'Internal depth must be >=610mm / 24".'),
  ('Flic Button (Gen 2)', 'accessory', 'flic', 'flic.io', null, 0, null, null),
  ('Aluminum Printed Sign 6x8', 'signage', 'signage', null, null, 0, 'PH supplier not yet sourced.', null);

-- Alternates, inactive so they do not claim a role key. Activate by
-- deactivating the incumbent first.
insert into items (name, category, role_key, supplier, poe_watts, rack_u, is_active, notes) values
  ('Uniview IPC3624LE-ADF28K-WP (Owlview)', 'camera', null, 'Drextech', null, 0, false, '10 on hand; the unit on the Tela Park rig. 4MP 2.8mm fixed, 802.3af. VERIFY MAX PoE DRAW before activating as replay_camera — it is materially lower than the Dahua''s 17.5W, and the budget check depends on it.');
