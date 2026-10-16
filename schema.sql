-- الحسن للاتصالات: نفّذ هذا الملف مرة واحدة في Supabase SQL Editor.
-- لا تضع service_role key داخل ملفات الواجهة أو في GitHub.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'موبايلات',
  brand text not null default '',
  model text not null default '',
  condition text not null default 'جديد' check (condition in ('جديد','مستعمل')),
  price numeric(14,2) not null default 0 check (price >= 0),
  currency text not null default 'دولار أمريكي' check (currency in ('دولار أمريكي','ليرة تركية','ليرة سورية')),
  stock integer not null default 0 check (stock >= 0),
  status text not null default 'active' check (status in ('active','hidden')),
  image_url text not null default '',
  is_offer boolean not null default false,
  warranty text not null default '',
  ram text not null default '',
  storage text not null default '',
  color text not null default '',
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- عداد مشاهدة آمن: لا يسمح بتعديل السعر أو المخزون من الواجهة العامة.
create or replace function public.increment_product_view(p_product_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products set views = views + 1
  where id = p_product_id and status = 'active';
$$;
revoke all on function public.increment_product_view(uuid) from public;
grant execute on function public.increment_product_view(uuid) to anon, authenticated;

create index if not exists products_status_created_idx on public.products(status, created_at desc);
create index if not exists products_category_idx on public.products(category);
create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));

alter table public.products enable row level security;
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products" on public.products for select to anon, authenticated using (status = 'active' or public.is_admin());
drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products" on public.products for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products for delete to authenticated using (public.is_admin());

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('product_view','whatsapp_click','order_created')),
  product_id uuid null references public.products(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists analytics_created_idx on public.analytics_events(created_at desc);
alter table public.analytics_events enable row level security;
drop policy if exists "Visitors can record basic events" on public.analytics_events;
create policy "Visitors can record basic events" on public.analytics_events for insert to anon, authenticated with check (event_type in ('product_view','whatsapp_click','order_created'));
drop policy if exists "Admins can read analytics" on public.analytics_events;
create policy "Admins can read analytics" on public.analytics_events for select to authenticated using (public.is_admin());

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  total numeric(14,2) not null default 0,
  currency text not null default 'دولار أمريكي',
  item_summary text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders(created_at desc);
alter table public.orders enable row level security;
drop policy if exists "Visitors can create inquiry orders" on public.orders;
create policy "Visitors can create inquiry orders" on public.orders for insert to anon, authenticated with check (status = 'pending' and total >= 0);
drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Storage bucket: صور عامة للعرض، لكن الرفع والحذف والتعديل للمالك فقط.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images" on storage.objects for select using (bucket_id = 'product-images');
drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin()) with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- لا تنشئ مستخدم مالك بكلمة مرور داخل SQL. أنشئه من Authentication في لوحة Supabase،
-- ثم أضف UUID الخاص به إلى public.admins حسب ملف README_AR.md.
