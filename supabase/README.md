# Supabase setup

Run the migrations in order, then the seed.

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
