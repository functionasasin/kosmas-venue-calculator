alter table items enable row level security;
alter table venues enable row level security;
alter table venue_lines enable row level security;

-- The anon key ships in the JS bundle, so the browser is untrusted. Hiding
-- the catalog nav from the user account is cosmetic; these policies are the
-- actual enforcement.
create policy "items readable by any signed-in user"
  on items for select to authenticated using (true);

-- Role is read from app_metadata, never user_metadata: users can write their
-- own user_metadata via the client SDK and would self-promote to admin.
create policy "items writable by admin only"
  on items for all to authenticated
  using      (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "venues readable by any signed-in user"
  on venues for select to authenticated using (true);
create policy "venues writable by any signed-in user"
  on venues for all to authenticated using (true) with check (true);

create policy "venue lines readable by any signed-in user"
  on venue_lines for select to authenticated using (true);
create policy "venue lines writable by any signed-in user"
  on venue_lines for all to authenticated using (true) with check (true);
