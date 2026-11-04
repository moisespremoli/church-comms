-- Emula o mínimo do ambiente Supabase num PostgreSQL local para testar
-- migrações e RLS: esquema auth, auth.uid(), papéis anon/authenticated/service_role
-- e os privilégios por omissão que o Supabase concede.
-- NÃO aplicar num projeto Supabase real.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Realtime (mínimo): realtime.messages, realtime.topic() e realtime.send()
-- com a mesma forma que o Supabase usa para Broadcast privado.
create schema if not exists realtime;

create table if not exists realtime.messages (
  id          bigint generated always as identity primary key,
  topic       text not null,
  extension   text not null,
  payload     jsonb,
  event       text,
  private     boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;

create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text;
$$;

create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql security definer as $$
begin
  insert into realtime.messages (payload, event, topic, private, extension)
  values (payload, event, topic, private, 'broadcast');
end;
$$;

grant usage on schema realtime to authenticated, anon;
grant select, insert on realtime.messages to authenticated;
grant execute on function realtime.topic() to authenticated, anon;
