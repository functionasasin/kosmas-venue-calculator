-- Item names stop restating the role the item fills.
--
-- Two rows carried a parenthetical naming their role and nothing else:
-- "(Replay Camera)" on the Dahua and "(Access Point)" on the U7-LR. The Dahua's
-- earned its place once — the same SKU was seeded twice, as replay_camera and
-- as the Autonomous+ security_camera, and the suffix was the only thing telling
-- the two rows apart in a list. That second row is gone (no PH SKU has been
-- chosen for surveillance; a generic placeholder holds the role), so the suffix
-- now disambiguates nothing.
--
-- What actually retires it is the swap picker: swapOptionsFor narrows a line's
-- options to its ROLE FAMILY as of this release, so the control that offers the
-- Dahua offers replay cameras and only replay cameras. The role is carried by
-- the context, and repeating it in the name reads as part of the SKU on a
-- printed BOM.
--
-- NOT touched, deliberately: "(Owlview)" is Uniview's product-line name for
-- that SKU — the same kind of thing as "(U8000F)", "(Gen 2)", "(M4)" or
-- "(802.3af, 12W)" — not a role tag that happens to look like one. It is also
-- the half of the name a supplier recognises on a quote.
--
-- Display-only: no application code matches on items.name, and venue_lines
-- references items by id, so this is order-independent with the deploy.
--
-- Exact-name predicates with an asserted match count, following 0014: this runs
-- once against live data with no rollback path, and a `like` that quietly
-- matched two rows (or zero, after a partial re-run) would rename something
-- unintended or claim success having renamed nothing.
do $$
declare
  v_renamed int;
begin
  update items
     set name = 'EmpireTech / Dahua IPC-HDW5459T-ZE-IL'
   where name = 'EmpireTech / Dahua IPC-HDW5459T-ZE-IL (Replay Camera)';
  get diagnostics v_renamed = row_count;
  if v_renamed <> 1 then
    raise exception
      'expected exactly 1 replay camera row to rename, updated %', v_renamed;
  end if;

  update items
     set name = 'UniFi U7-LR'
   where name = 'UniFi U7-LR (Access Point)';
  get diagnostics v_renamed = row_count;
  if v_renamed <> 1 then
    raise exception
      'expected exactly 1 access point row to rename, updated %', v_renamed;
  end if;
end $$;
