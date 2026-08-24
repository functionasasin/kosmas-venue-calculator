# Supabase setup

Run everything in `supabase/` in **numeric order**, with the seed in its own
position — `0001`, `0002`, then `seed/0003_catalog_seed.sql`, then `0004`
onwards. Not all the migrations followed by the seed.

The seed is numbered `0003` because it has to land there. It runs under
`0001`'s original `items_role_key_active` index, which is why it leaves the
Dahua replay camera inactive; `0011` then relaxes that index and backfills
`is_default` over the rows the seed created, and `0014` activates the Dahua
alongside the Uniview. Run the seed last instead and two things break: `0011`
backfills nothing, so no role has a default and every venue resolves its
hardware to nothing, and `0014` aborts on its own guard because the row it
activates does not exist yet.

## Accounts

Create exactly two users in Authentication → Users. There is no sign-up flow
and no user-management screen in the app.

Set each user's role in **app_metadata**, never user_metadata — users can
write their own user_metadata via the client SDK, so a role stored there
would let the `user` account promote itself to admin.

Via the Management API or SQL editor:

    update auth.users
       set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
     where email = '<admin email>';

    update auth.users
       set raw_app_meta_data = raw_app_meta_data || '{"role":"user"}'
     where email = '<user email>';

Users must sign out and back in for a changed role to appear in their JWT.

## Session settings

Both employees may be signed into the same account simultaneously. Verify in
Authentication → Settings that single-session-per-user enforcement is OFF and
that refresh-token rotation does not revoke sibling sessions.
