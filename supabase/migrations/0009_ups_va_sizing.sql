-- UPS sizing by VA rating instead of a named SKU.
--
-- The tool used to emit a fixed "KSTAR MP RT 3K S" line on every venue. PH does
-- ship that unit on every venue, but it is the top of the ladder — 3000 VA /
-- 2700 W — and a 4-court venue needs 750 VA. Naming the SKU told whoever was
-- quoting nothing about the requirement, so the BOM now carries the rating and
-- the KSTAR is recorded in podplay-ph-venue-sizing.md as the part that meets it.
--
-- See docs: podplay-ph-venue-sizing.md § UPS, § VA sizing by court count.

-- 1. Mains draw. poe_watts could not carry this: a switch has BOTH (60W of its
--    own, 600W it hands out) and only the first belongs on the UPS, while only
--    the second belongs against the switch's PoE budget. Merging them would
--    double-count every PoE device and omit every mains-only device.
alter table items add column mains_watts numeric;

comment on column items.mains_watts is
  'Maximum mains draw in watts, EXCLUDING any PoE the device itself outputs. '
  'Null means the device draws no mains — the normal case, since everything '
  'court-side is powered over Ethernet. Feeds UPS sizing only.';

-- Verified against the manufacturers on 2026-08-20, not taken from the source
-- spreadsheet, which carries 60W for every switch and 30W for the Mac mini.
update items set mains_watts = 50 where role_key in ('gateway_udm_se', 'gateway_udm_pro');
update items set mains_watts = 50 where role_key = 'switch_24_pro';
update items set mains_watts = 25 where role_key = 'switch_24_std';
update items set mains_watts = 60 where role_key = 'switch_48_pro';
update items set mains_watts = 20 where role_key = 'kisi_controller';

-- The sheet says 30W. Apple's own power table (support.apple.com/en-us/103253)
-- gives the M4 Mac mini as idle 4W / max 65W, and this column is maxima. 30W is
-- a light-load figure and was the only wattage in the whole load that erred low
-- — i.e. the only one that could under-size a UPS.
update items set mains_watts = 65 where role_key = 'mac_mini';

-- 2. The security camera row held a REPLAY camera's SKU and its 17.5W. No PH
--    security camera has been chosen (confirmed 2026-08-20) — every Dahua,
--    EmpireTech and Uniview part named in the docs is a replay camera. 7W is
--    the sizing doc's planning figure for the 802.3af class, recorded as such.
update items set
  name = 'Security Camera — SKU not yet selected',
  poe_watts = 7,
  supplier = null,
  notes = 'PLANNING FIGURE, NOT A SPEC. No PH SKU has been chosen. 7W is the '
          'sizing doc''s max-draw estimate for the 802.3af G5 class. If PH '
          'picks a PoE+ part this roughly doubles and every Autonomous+ UPS '
          'rung must be recomputed. Do NOT fill this with one of the Dahua / '
          'EmpireTech / Uniview cameras in the docs — those are all REPLAY '
          'cameras, and reading one onto this line inflates every Autonomous+ '
          'figure. Autonomous+ only; ships from US/HK.'
where role_key = 'security_camera';

-- 3. Retire the KSTAR. It keeps its now-dead role_key: the unique index is on
--    active rows only, and leaving the row in place means any historical
--    venue_line pointing at it still resolves to a name rather than a blank.
update items set
  is_active = false,
  notes = 'RETIRED as a BOM line 2026-08-20 — the tool specs the UPS by VA '
          'rating now, not by SKU. Still the unit Kosmas stocks and installs: '
          '3000VA/2700W on-line, i.e. the top rung, so it satisfies every '
          'venue. Kept for provenance and for old venue lines.'
where role_key = 'ups';

-- 4. The ladder. These are the sizes actually stocked in PH; 1600 VA is a
--    sourcing target, not a purchasable rung. The watt figure in each name is
--    the rating at PF 0.6 and is the BINDING number — VA alone does not
--    determine real power, and a low-PF unit can satisfy the VA figure while
--    under-delivering watts.
insert into items (name, category, role_key, supplier, poe_watts, mains_watts, rack_u, notes, print_note) values
  ('UPS — 750 VA / 450 W minimum, 2U rack-mount',  'power', 'ups_750va',  null, null, null, 2, null,
   'Watts is the binding figure, not VA. This rating assumes PF 0.6, the pessimistic end of line-interactive. A unit stating a better power factor can meet the same watts at a smaller VA — online double-conversion units run PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W), so one of those may legitimately drop a rung. VA and kVA are the same unit: 1 kVA = 1000 VA, and PH sellers use both, often on the same listing. Line-interactive with AVR MINIMUM — never pure standby/offline, PH mains are noisy enough to need buck/boost. 230V. Rack needs >=610mm internal depth. The rating is capacity, not runtime — confirm runtime separately if the venue needs graceful shutdown.'),
  ('UPS — 1000 VA (1 kVA) / 600 W minimum, 2U rack-mount', 'power', 'ups_1000va', null, null, null, 2, null,
   'Watts is the binding figure, not VA. This rating assumes PF 0.6, the pessimistic end of line-interactive. A unit stating a better power factor can meet the same watts at a smaller VA — online double-conversion units run PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W), so one of those may legitimately drop a rung. VA and kVA are the same unit: 1 kVA = 1000 VA, and PH sellers use both, often on the same listing. Line-interactive with AVR MINIMUM — never pure standby/offline, PH mains are noisy enough to need buck/boost. 230V. Rack needs >=610mm internal depth. The rating is capacity, not runtime — confirm runtime separately if the venue needs graceful shutdown.'),
  ('UPS — 1500 VA (1.5 kVA) / 900 W minimum, 2U rack-mount', 'power', 'ups_1500va', null, null, null, 2, null,
   'Watts is the binding figure, not VA. This rating assumes PF 0.6, the pessimistic end of line-interactive. A unit stating a better power factor can meet the same watts at a smaller VA — online double-conversion units run PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W), so one of those may legitimately drop a rung. VA and kVA are the same unit: 1 kVA = 1000 VA, and PH sellers use both, often on the same listing. Line-interactive with AVR MINIMUM — never pure standby/offline, PH mains are noisy enough to need buck/boost. 230V. Rack needs >=610mm internal depth. The rating is capacity, not runtime — confirm runtime separately if the venue needs graceful shutdown.'),
  ('UPS — 2000 VA (2 kVA) / 1200 W minimum, 2U rack-mount','power', 'ups_2000va', null, null, null, 2, null,
   'Watts is the binding figure, not VA. This rating assumes PF 0.6, the pessimistic end of line-interactive. A unit stating a better power factor can meet the same watts at a smaller VA — online double-conversion units run PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W), so one of those may legitimately drop a rung. VA and kVA are the same unit: 1 kVA = 1000 VA, and PH sellers use both, often on the same listing. Line-interactive with AVR MINIMUM — never pure standby/offline, PH mains are noisy enough to need buck/boost. 230V. Rack needs >=610mm internal depth. The rating is capacity, not runtime — confirm runtime separately if the venue needs graceful shutdown.'),
  ('UPS — 3000 VA (3 kVA) / 1800 W minimum, 2U rack-mount','power', 'ups_3000va', null, null, null, 2,
   'Top of the ladder. The stocked KSTAR MP RT 3K S is a 3000VA/2700W on-line unit and satisfies this rung with room to spare.',
   'Watts is the binding figure, not VA. This rating assumes PF 0.6, the pessimistic end of line-interactive. A unit stating a better power factor can meet the same watts at a smaller VA — online double-conversion units run PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W), so one of those may legitimately drop a rung. VA and kVA are the same unit: 1 kVA = 1000 VA, and PH sellers use both, often on the same listing. Line-interactive with AVR MINIMUM — never pure standby/offline, PH mains are noisy enough to need buck/boost. 230V. Rack needs >=610mm internal depth. The rating is capacity, not runtime — confirm runtime separately if the venue needs graceful shutdown.');

-- 5. The 12U rack's note named the KSTAR, which is no longer what the BOM asks
--    for. The depth constraint is unchanged — it is a property of rack-mount
--    UPS units generally, most of which are ~600mm deep.
update items set
  print_note = 'Internal depth must be >=610mm / 24". Rack-mount UPS units are typically 600mm deep — confirm the depth of the unit actually sourced.'
where role_key = 'rack_12u';
