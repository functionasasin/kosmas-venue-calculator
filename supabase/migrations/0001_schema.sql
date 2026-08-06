create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'uncategorised',
  role_key text,
  supplier text,
  poe_watts numeric,      -- MAXIMUM draw, not typical
  rack_u numeric,
  unit_price numeric,     -- admin catalog form only, never displayed elsewhere
  currency text,
  is_active boolean not null default true,
  notes text,              -- internal working notes, never printed
  print_note text,         -- constraints that must travel with the item on the
                           -- handed-out list (rack depth, voltage rating)
  updated_at timestamptz not null default now()
);

-- Only one ACTIVE item may claim a role key. Deactivated items keep theirs so
-- venues referencing them still resolve.
create unique index items_role_key_active
  on items (role_key) where is_active and role_key is not null;

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  courts integer not null check (courts >= 1),
  tier text not null,
  security_cameras integer not null default 0 check (security_cameras >= 0),
  kisi_doors integer not null default 0 check (kisi_doors >= 0),
  brand text not null default 'podplay',
  extended_retention boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table venue_lines (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  qty integer not null default 0 check (qty >= 0),
  -- The sizing doc declines to give a number for access points and, on most
  -- brands, the fence bracket. Without this flag a saved TBD reloads as 0 and
  -- prints as 0 on the handed-out materials list.
  qty_tbd boolean not null default false,
  sort_order integer not null default 0,
  source text not null default 'formula' check (source in ('formula','manual')),
  -- A deleted formula line must STAY deleted; without this the next
  -- recalculation resurrects every line the user removed.
  suppressed boolean not null default false,
  -- The role this line replaced, when the user swapped its SKU. Without it,
  -- recalculation sees the vacated role as missing and re-adds the original
  -- alongside the swap.
  origin_role_key text,
  note text
);

create index venue_lines_venue on venue_lines (venue_id);
