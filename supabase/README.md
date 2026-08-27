# Supabase setup

Run everything in `supabase/` in **numeric order**, with the seed in its own
position — `0001`, `0002`, then `seed/0003_catalog_seed.sql`, then `0004`
onwards. Not all the migrations followed by the seed.

`0017` creates `items_public`, the narrowed catalog view an anonymous browser
reads. It is a definer view on purpose: that is what lets it return rows without
a session. Do not add `security_invoker = true` — see the comment in the file.

The seed is numbered `0003` because it has to land there. It runs under
`0001`'s original `items_role_key_active` index, which is why it leaves the
Dahua replay camera inactive; `0011` then relaxes that index and backfills
`is_default` over the rows the seed created, and `0014` activates the Dahua
alongside the Uniview. Run the seed last instead and `0014` aborts on its own
guard because the row it activates does not exist yet. `0011` backfilling
nothing is comparatively harmless — every role still has exactly one active
item at that point, and `resolveCatalog` falls back to a role's sole active
item when no default is set, so no role carries a default flag but nothing
fails to resolve.

## Accounts

**An account is for staff only.** Since the login came out, anyone can open the
app, size a venue and export its materials list with no account at all — that
venue lives in the visitor's own browser (`localStorage`), never in this
database. An account buys exactly two things: venues stored here rather than in
one browser, and the Catalog.

So create **admin accounts only**. There is no sign-up flow and no
user-management screen in the app.

Set the role in **app_metadata**, never user_metadata — users can write their
own user_metadata via the client SDK, so a role stored there would let any
account promote itself to admin.

Via the Management API or SQL editor:

    update auth.users
       set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
     where email = '<admin email>';

Users must sign out and back in for a changed role to appear in their JWT.

**An account created without that claim is not broken, it is limited**:
`useRole` returns null, so it gets the same surface as an anonymous visitor
plus database-backed venues, and no Catalog. That is the intended way to make a
restricted account, and it needs no code change.

There was a second role, `'user'`, until the anonymous work shipped. It existed
so a non-admin employee could size venues without reaching the Catalog — which
is now what a visitor with no account gets for free, so the role had nothing
left to mean. `Role` in `src/auth/useRole.ts` is `'admin'` alone.

### Why `items writable by admin only` still keys on app_metadata

With one role left it is tempting to simplify `0002_rls.sql`'s policy to plain
`to authenticated`, and that was considered and rejected. Three reasons, in
order of weight:

1. It would silently widen access the moment any non-admin account exists —
   including one created by mistake. The claim check fails closed; `to
   authenticated` fails open.
2. It is what makes the limited account above possible at all. Without the
   claim check there is no way to hand someone a login that cannot rewrite the
   catalog every venue is sized from.
3. It costs one JSON lookup per statement on a table with 38 rows.

The catalog is the single shared input to every venue's materials list, so a
bad write there is not one venue's problem. Leave the policy alone.

## Session settings

Both employees may be signed into the same account simultaneously. Verify in
Authentication → Settings that single-session-per-user enforcement is OFF and
that refresh-token rotation does not revoke sibling sessions.

Signing out no longer empties the screen: the app renders the venue list for
everyone, and a sign-out while a database venue is open raises a dialog saying
the unsaved edits are lost rather than silently navigating away.
