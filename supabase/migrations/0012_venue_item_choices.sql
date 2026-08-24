-- Which catalog item this venue gets for a role key, when the role has more
-- than one active item.
--
-- Rows exist for every venue as soon as a role has a choice to make, not
-- lazily on save: a migration that activates a second item for a role key must
-- insert a choice row for every existing venue naming the role's current
-- default, in the same transaction (0014 does). Otherwise whether a venue is
-- protected from a default flip depends on unrelated edits.
create table venue_item_choices (
  venue_id uuid not null references venues(id) on delete cascade,
  role_key text not null,
  -- Documentation rather than a live safeguard: there is no delete-item path
  -- in the UI, only activation toggling. It states the intent for whoever adds
  -- one.
  item_id  uuid not null references items(id) on delete restrict,
  primary key (venue_id, role_key)
);

alter table venue_item_choices enable row level security;

-- Mirrors venue_lines exactly (0002). Venues are readable and writable by any
-- signed-in account; the catalog is the admin-only table.
create policy "venue item choices readable by any signed-in user"
  on venue_item_choices for select to authenticated using (true);
create policy "venue item choices writable by any signed-in user"
  on venue_item_choices for all to authenticated using (true) with check (true);
