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
-- Rows are identified by ROLE_KEY plus the suffix being stripped, never by the
-- full display name. 0014 is the reason: its `like '%IPC-HDW5459T-ZE-IL%'`
-- predicate matched a DIFFERENT name in the seed than in production
-- ("Dahua DH-IPC-HDW5459T-ZE-IL-2712" vs "EmpireTech / Dahua
-- IPC-HDW5459T-ZE-IL"), each environment satisfied its count-1 assertion
-- separately, and the drift went unnoticed for weeks. Matching on the stable
-- identifier instead means this migration does not care what the rest of the
-- name says, and no future rename of these SKUs has to be mirrored into the
-- seed to keep it working.
--
-- role_key alone is not enough — replay_camera has held two active items since
-- 0014 — so the suffix predicate is what narrows it to the one row that has a
-- role suffix to lose. The count is still asserted: this runs once against live
-- data with no rollback path, and a predicate that matched two rows (or zero,
-- after a partial re-run) would rename something unintended or claim success
-- having renamed nothing.
do $$
declare
  v_renamed int;
begin
  update items
     set name = replace(name, ' (Replay Camera)', '')
   where role_key = 'replay_camera' and name like '% (Replay Camera)';
  get diagnostics v_renamed = row_count;
  if v_renamed <> 1 then
    raise exception
      'expected exactly 1 replay camera row to rename, updated %', v_renamed;
  end if;

  update items
     set name = replace(name, ' (Access Point)', '')
   where role_key = 'access_point' and name like '% (Access Point)';
  get diagnostics v_renamed = row_count;
  if v_renamed <> 1 then
    raise exception
      'expected exactly 1 access point row to rename, updated %', v_renamed;
  end if;
end $$;
