-- HALLOWEEN DA VK — BANCO DE DADOS SUPABASE
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.event_settings (
  id integer primary key default 1 check (id = 1),
  female_price numeric(10,2) not null default 25,
  male_price numeric(10,2) not null default 30,
  capacity integer not null default 60,
  updated_at timestamptz not null default now()
);
insert into public.event_settings(id,female_price,male_price,capacity)
values(1,25,30,60) on conflict(id) do nothing;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_vk_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admins where user_id=auth.uid()); $$;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check(price >= 0),
  quantity integer not null check(quantity > 0),
  eligibility text not null default 'both' check(eligibility in ('both','Feminino','Masculino')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_code text not null unique,
  full_name text not null,
  phone text not null,
  age integer check(age is null or age >= 16),
  gender text check(gender is null or gender in ('Feminino','Masculino')),
  promotion_id uuid references public.promotions(id) on delete set null,
  promotion_name text,
  price numeric(10,2),
  status text not null default 'pending' check(status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_history (
  id bigint generated always as identity primary key,
  promotion_id uuid,
  promotion_name text,
  action text not null,
  created_at timestamptz not null default now()
);

create or replace function public.log_promotion_change()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.promotion_history(promotion_id,promotion_name,action) values(new.id,new.name,'Criada');
    return new;
  elsif tg_op='UPDATE' then
    insert into public.promotion_history(promotion_id,promotion_name,action)
    values(new.id,new.name,case when old.active is distinct from new.active then (case when new.active then 'Ativada' else 'Desativada' end) else 'Editada' end);
    return new;
  elsif tg_op='DELETE' then
    insert into public.promotion_history(promotion_id,promotion_name,action) values(old.id,old.name,'Excluída');
    return old;
  end if;
  return null;
end; $$;
drop trigger if exists promotions_audit on public.promotions;
create trigger promotions_audit after insert or update or delete on public.promotions
for each row execute function public.log_promotion_change();

-- Função atômica: impede que duas pessoas ocupem a última vaga simultaneamente.
create or replace function public.create_registration(
  p_full_name text,p_phone text,p_age integer,p_gender text,p_promotion_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_capacity integer; v_occupied integer; v_price numeric(10,2);
  v_promo public.promotions%rowtype; v_promo_name text; v_code text; v_id uuid;
  v_female numeric(10,2); v_male numeric(10,2);
begin
  if p_age < 16 then raise exception 'IDADE_MINIMA_16'; end if;
  if p_gender not in ('Feminino','Masculino') then raise exception 'TIPO_INGRESSO_INVALIDO'; end if;
  if length(trim(p_full_name)) < 4 or length(trim(p_phone)) < 8 then raise exception 'DADOS_INVALIDOS'; end if;
  select capacity,female_price,male_price into v_capacity,v_female,v_male
  from public.event_settings where id=1 for update;
  select count(*) into v_occupied from public.registrations where status <> 'cancelled';
  if v_occupied >= v_capacity then raise exception 'CAPACITY_FULL'; end if;
  v_price := case when p_gender='Feminino' then v_female else v_male end;
  if p_promotion_id is not null then
    select * into v_promo from public.promotions where id=p_promotion_id and active=true for update;
    if found
      and (v_promo.eligibility='both' or v_promo.eligibility=p_gender)
      and (v_promo.starts_at is null or now() >= v_promo.starts_at)
      and (v_promo.ends_at is null or now() <= v_promo.ends_at)
      and (select count(*) from public.registrations where promotion_id=v_promo.id and status <> 'cancelled') < v_promo.quantity
    then
      v_price:=v_promo.price;v_promo_name:=v_promo.name;
    end if;
  end if;
  v_code := upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
  insert into public.registrations(registration_code,full_name,phone,age,gender,promotion_id,promotion_name,price)
  values(v_code,trim(p_full_name),trim(p_phone),p_age,p_gender,
    case when v_promo_name is null then null else p_promotion_id end,v_promo_name,v_price)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'registration_code',v_code,'price',v_price,'promotion_name',v_promo_name);
end; $$;

alter table public.event_settings enable row level security;
alter table public.admins enable row level security;
alter table public.promotions enable row level security;
alter table public.registrations enable row level security;
alter table public.promotion_history enable row level security;

drop policy if exists "Public can read event settings" on public.event_settings;
create policy "Public can read event settings" on public.event_settings for select to anon,authenticated using(true);
drop policy if exists "Public can read active promotions" on public.promotions;
create policy "Public can read active promotions" on public.promotions for select to anon,authenticated using(active=true or public.is_vk_admin());
drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions" on public.promotions for all to authenticated using(public.is_vk_admin()) with check(public.is_vk_admin());
drop policy if exists "Admins manage settings" on public.event_settings;
create policy "Admins manage settings" on public.event_settings for update to authenticated using(public.is_vk_admin()) with check(public.is_vk_admin());
drop policy if exists "Admins read registrations" on public.registrations;
create policy "Admins read registrations" on public.registrations for select to authenticated using(public.is_vk_admin());
drop policy if exists "Admins update registrations" on public.registrations;
create policy "Admins update registrations" on public.registrations for update to authenticated using(public.is_vk_admin()) with check(public.is_vk_admin());
drop policy if exists "Admins read history" on public.promotion_history;
create policy "Admins read history" on public.promotion_history for select to authenticated using(public.is_vk_admin());
drop policy if exists "Admins read admin list" on public.admins;
create policy "Admins read admin list" on public.admins for select to authenticated using(user_id=auth.uid() or public.is_vk_admin());

revoke all on public.registrations from anon,authenticated;
grant execute on function public.create_registration(text,text,integer,text,uuid) to anon,authenticated;
grant select on public.event_settings to anon,authenticated;
grant select on public.promotions to anon,authenticated;
grant select,insert,update,delete on public.promotions to authenticated;
grant update on public.event_settings to authenticated;
grant select,update on public.registrations to authenticated;
grant select on public.promotion_history to authenticated;
grant select on public.admins to authenticated;

-- Depois de criar o usuário em Authentication > Users, adicione o UUID dele:
-- insert into public.admins(user_id) values('COLE-AQUI-O-UUID-DO-USUARIO-ADMIN');

-- Promoção inicial já combinada: primeiros 20 compradores por R$ 20.
insert into public.promotions(id,name,price,quantity,eligibility,active)
select '11111111-1111-4111-8111-111111111111'::uuid,'Primeiros 20 compradores',20,20,'both',true
where not exists(select 1 from public.promotions where name='Primeiros 20 compradores');

-- Os três nomes foram informados como pagos/confirmados.
-- Não foram fornecidos telefone, idade, gênero nem o valor exato da Amanda;
-- por isso esses campos ficam sem informação até serem atualizados no painel/banco.
insert into public.registrations(registration_code,full_name,phone,age,gender,promotion_id,promotion_name,price,status)
select 'VKVICT01','Victoria Gesser','',null,null,
  (select id from public.promotions where name='Primeiros 20 compradores' order by created_at limit 1),
  'Primeiros 20 compradores',20,'confirmed'
where not exists(select 1 from public.registrations where full_name='Victoria Gesser');

insert into public.registrations(registration_code,full_name,phone,age,gender,promotion_id,promotion_name,price,status)
select 'VKAMAB02','Amabile Andriele Willy','',null,null,
  (select id from public.promotions where name='Primeiros 20 compradores' order by created_at limit 1),
  'Primeiros 20 compradores',20,'confirmed'
where not exists(select 1 from public.registrations where full_name='Amabile Andriele Willy');

insert into public.registrations(registration_code,full_name,phone,age,gender,promotion_id,promotion_name,price,status)
select 'VKAMAN03','Amanda Emanuely Ribeiro Gonçalves','',null,null,
  (select id from public.promotions where name='Primeiros 20 compradores' order by created_at limit 1),
  'Primeiros 20 compradores',null,'confirmed'
where not exists(select 1 from public.registrations where full_name='Amanda Emanuely Ribeiro Gonçalves');
