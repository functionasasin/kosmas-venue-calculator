-- Print notes are what a buyer must ACT on. Two of them had grown into an
-- explanation of the sizing instead, and print_note is the one field that
-- reaches a document handed outside the company.
--
-- The UPS note ran to 671 characters on every rung — seven printed lines under
-- a one-line item, at the same size and weight as the hardware. Most of it was
-- reasoning already written down in podplay-ph-venue-sizing.md (the PF 0.6
-- assumption, the online-unit exception, kVA vs VA, why AVR): true, useful to
-- whoever is sizing, and not an instruction to whoever is buying. It moves to
-- `notes`, which is internal and never printed, and the constraints stay.
--
-- Nothing actionable is dropped: watts-binds, the online-unit rung exception,
-- line-interactive/AVR, 230V, rack depth and capacity-not-runtime all survive
-- in the shorter text.
--
-- Guarded on the row counts. These predicates match by name, and a name that
-- has been edited since would silently update nothing at all — so the whole
-- thing aborts rather than half-applying, the same way 0014 does.
do $$
declare
  ups_rows int;
  panel_rows int;
  ups_rationale text :=
    'Sizing rationale, moved off the printed note 2026-08-24 — the full '
    'version is in podplay-ph-venue-sizing.md. The VA figure assumes PF 0.6, '
    'the pessimistic end of line-interactive; an online double-conversion '
    'unit at PF 0.9-1.0 (the APC SRT1000XLI is 1000 VA / 1000 W) can meet the '
    'same watts a rung lower. VA and kVA are one unit: 1 kVA = 1000 VA, and '
    'PH sellers use both, often in the same listing. AVR matters because PH '
    'mains are noisy enough to need buck/boost. Capacity is not runtime — '
    'confirm runtime separately if the venue needs graceful shutdown.';
begin
  update items set
    print_note =
      'Watts binds, not VA — an online unit (PF 0.9-1.0) may meet the same '
      'watts a rung lower. Line-interactive with AVR minimum, never '
      'standby/offline. 230V. Rack depth >=610mm. Capacity, not runtime.',
    -- Appended, never replaced: the 3000 VA rung already carries a note about
    -- the stocked KSTAR, and clobbering it would lose the only record of why
    -- that rung is the top of the ladder.
    notes = case
      when notes is null or notes = '' then ups_rationale
      else notes || ' ' || ups_rationale
    end,
    updated_at = now()
  where role_key in
    ('ups_750va', 'ups_1000va', 'ups_1500va', 'ups_2000va', 'ups_3000va');
  get diagnostics ups_rows = row_count;

  update items set
    print_note =
      'Cat6-rated (not Cat5e), 48 ports, 1U. MUST be pass-through couplers / '
      'coupler keystones, not punch-down. FRONT ports patch to the switch; '
      'BACK terminates court runs. If no 48-port coupler panel is sourceable, '
      '2x 24-port panels substitute cleanly at the cost of 1U.',
    notes = coalesce(notes || ' ', '')
      || 'Front + rear cable management bar if available — moved off the '
         'printed note 2026-08-24 as an optional accessory rather than a '
         'constraint.',
    updated_at = now()
  where role_key = 'patch_panel_48';
  get diagnostics panel_rows = row_count;

  if ups_rows <> 5 then
    raise exception 'expected 5 UPS rungs, matched %', ups_rows;
  end if;
  if panel_rows <> 1 then
    raise exception 'expected 1 48-port patch panel, matched %', panel_rows;
  end if;
end $$;
