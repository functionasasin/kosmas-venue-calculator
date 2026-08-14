-- A second WAN uplink on the UDM. It consumes one of the gateway's 8 RJ45
-- ports, which only matters on the Kisi tiers: one fewer port for a reader,
-- and at the margin that is what moves a venue from a 24-port switch to a
-- 48-port. See venue-sizing.md § Kisi port accounting.
--
-- Defaults false so every existing venue keeps the port count it was sized
-- with. A venue that does have a backup WAN has to be re-saved to pick it up,
-- which is correct: it is a fact about the site, not something derivable.
alter table venues
  add column backup_internet boolean not null default false;
