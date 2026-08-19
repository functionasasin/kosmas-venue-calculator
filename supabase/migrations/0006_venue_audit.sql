-- Email rather than a uuid into auth.users: auth.users is not client-readable,
-- so a uuid would need a profiles view or a join purely to render a name. With
-- two accounts the email in the column is the honest representation.
--
-- Both nullable: the one pre-existing venue has no author, and a backfill
-- would invent one.
alter table venues
  add column created_by_email text,
  add column updated_by_email text;

-- This trigger is what makes updated_at trustworthy. It was previously written
-- by the browser, and 0007's optimistic lock compares against it — so the lock
-- is only as honest as this function.
--
-- `set search_path = public` is not optional hygiene: without it the function
-- resolves `venues` and `auth.jwt()` through the caller's search_path, which is
-- what Supabase's linter flags as function_search_path_mutable.
create or replace function stamp_venue() returns trigger
language plpgsql security invoker
set search_path = public as $$
begin
  new.updated_at       := now();
  new.updated_by_email := coalesce(auth.jwt() ->> 'email', 'unknown');
  if tg_op = 'INSERT' then
    new.created_by_email := new.updated_by_email;
  else
    -- Immutable once set: an UPDATE must never rewrite authorship, including
    -- one that sends the column explicitly.
    new.created_by_email := old.created_by_email;
    new.created_at       := old.created_at;
  end if;
  return new;
end $$;

create trigger venues_stamp
  before insert or update on venues
  for each row execute function stamp_venue();
