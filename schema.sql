create table if not exists public.wishlist_reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id text not null,
  guest_name text not null,
  type text not null check ( type in ( 'full', 'contribution' ) ),
  created_at timestamptz not null default now()
);

alter table public.wishlist_reservations drop column if exists cancel_code;
alter table public.wishlist_reservations drop column if exists amount;

alter table public.wishlist_reservations enable row level security;

drop policy if exists "Anyone can read wishlist reservations" on public.wishlist_reservations;
drop policy if exists "Anyone can create wishlist reservations" on public.wishlist_reservations;
drop policy if exists "Anyone can cancel own wishlist reservations by code" on public.wishlist_reservations;
drop policy if exists "Anyone can cancel wishlist reservations by name" on public.wishlist_reservations;

create policy "Anyone can read wishlist reservations"
on public.wishlist_reservations
for select
to anon
using ( true );

create policy "Anyone can create wishlist reservations"
on public.wishlist_reservations
for insert
to anon
with check ( true );

create policy "Anyone can cancel wishlist reservations by name"
on public.wishlist_reservations
for delete
to anon
using ( true );

grant select, insert, delete on table public.wishlist_reservations to anon;

create index if not exists wishlist_reservations_gift_id_idx
on public.wishlist_reservations ( gift_id );
