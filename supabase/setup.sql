create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null check (category in ('Hairloss', 'Vitamins', 'Supplements', 'Other Products', 'Promotion Products')),
  amount text not null,
  format text not null,
  price numeric(10, 2) not null check (price > 0),
  old_price numeric(10, 2),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  rating numeric(3, 2) not null default 0 check (rating between 0 and 5),
  reviews integer not null default 0 check (reviews >= 0),
  badge text,
  flavor text not null default '',
  image text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id text primary key default 'main' check (id = 'main'),
  hero_image text,
  collection_images jsonb not null default '{"hair": null, "vitamins": null, "bodybuilder": null, "otherProducts": null}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id)
values ('main')
on conflict (id) do nothing;

alter table public.products enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "Site settings are publicly readable" on public.site_settings;
create policy "Site settings are publicly readable"
  on public.site_settings for select
  to anon, authenticated
  using (true);

grant select on public.products, public.site_settings to anon, authenticated;
revoke insert, update, delete on public.products, public.site_settings from anon, authenticated;
grant all on public.products, public.site_settings to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 500000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');
