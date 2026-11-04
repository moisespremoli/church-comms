-- =============================================================================
-- CHURCH COMMS — Fase 1: identidade, papéis, equipas, canais, membros,
-- mensagens em tempo real e auditoria.
--
-- Princípios:
--   * RLS ativa em todas as tabelas expostas ao cliente.
--   * Permissões avaliadas no servidor (funções SECURITY DEFINER com
--     search_path vazio) — nunca apenas no frontend.
--   * Colunas sensíveis (papel, estado) protegidas por trigger.
--   * Envio de mensagens idempotente (author_id, client_id) para evitar
--     duplicados após reconexão.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'coordinator', 'member');
create type public.channel_status as enum ('active', 'archived');
create type public.channel_member_role as enum ('lead', 'member');
create type public.message_kind as enum ('text', 'quick', 'system');

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users). O email NÃO é copiado para aqui: fica apenas
-- em auth.users e é lido pela administração no servidor (minimização RGPD).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  avatar_url  text check (avatar_url is null or avatar_url ~ '^https://'),
  role        public.app_role not null default 'member',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Dados públicos do perfil, associados à identidade Supabase Auth.';

-- ---------------------------------------------------------------------------
-- Equipas operacionais
-- ---------------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 280),
  color       text not null default 'slate',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  is_lead    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- Canais
-- ---------------------------------------------------------------------------
create table public.channels (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 48),
  name           text not null check (char_length(name) between 1 and 60),
  description    text not null default '' check (char_length(description) <= 280),
  icon           text not null default 'hash' check (icon ~ '^[a-z0-9-]{1,32}$'),
  color          text not null default 'slate'
                 check (color in ('slate','sky','emerald','amber','rose','violet','orange','cyan','red')),
  status         public.channel_status not null default 'active',
  is_emergency   boolean not null default false,
  has_voice_room boolean not null default false,
  sort_order     integer not null default 100,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index channels_sort_idx on public.channels (sort_order, name);

create table public.channel_members (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  member_role  public.channel_member_role not null default 'member',
  can_post     boolean not null default true,
  last_read_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_members_user_idx on public.channel_members (user_id);

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels (id) on delete cascade,
  -- set null: ao eliminar um utilizador (RGPD) as mensagens ficam anónimas.
  author_id   uuid references public.profiles (id) on delete set null,
  client_id   uuid not null,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  kind        public.message_kind not null default 'text',
  reply_to_id uuid references public.messages (id) on delete set null,
  created_at  timestamptz not null default now(),
  search      tsvector generated always as (to_tsvector('portuguese', body)) stored,
  constraint messages_author_client_uniq unique (author_id, client_id)
);
create index messages_channel_created_idx on public.messages (channel_id, created_at desc, id desc);
create index messages_author_created_idx on public.messages (author_id, created_at desc);
create index messages_search_idx on public.messages using gin (search);

-- ---------------------------------------------------------------------------
-- Auditoria (só escrita por triggers; só leitura por administradores)
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- =============================================================================
-- Funções de permissão (usadas pelas políticas RLS)
-- =============================================================================
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active and role = 'admin'
  );
$$;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.channel_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.channel_id = p_channel_id
      and cm.user_id = (select auth.uid())
      and p.is_active
  );
$$;

create or replace function public.is_channel_lead(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.channel_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.channel_id = p_channel_id
      and cm.user_id = (select auth.uid())
      and cm.member_role = 'lead'
      and p.is_active
      and p.role in ('admin', 'coordinator')
  );
$$;

create or replace function public.can_view_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_channel_member(p_channel_id);
$$;

create or replace function public.can_post(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.status = 'active'
  )
  and (
    public.is_admin()
    or exists (
      select 1
      from public.channel_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.channel_id = p_channel_id
        and cm.user_id = (select auth.uid())
        and cm.can_post
        and p.is_active
    )
  );
$$;

-- Dois utilizadores partilham pelo menos um canal (para ver perfis de colegas).
create or replace function public.shares_channel_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.channel_members a
    join public.channel_members b on b.channel_id = a.channel_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user_id
  );
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- updated_at genérico
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger teams_touch before update on public.teams
  for each row execute function public.touch_updated_at();
create trigger channels_touch before update on public.channels
  for each row execute function public.touch_updated_at();

-- Novo utilizador em auth.users => perfil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 120)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Proteção de colunas do perfil: só admins (ou o backend com service role,
-- onde auth.uid() é nulo) alteram papel e estado. Garante sempre um admin ativo.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil não pode ser alterado' using errcode = '42501';
  end if;

  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Sem permissão para alterar papel ou estado' using errcode = '42501';
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles
       where id <> old.id and role = 'admin' and is_active
     ) then
    raise exception 'Tem de existir pelo menos um administrador ativo' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Coordenadores responsáveis por um canal só podem editar a apresentação.
create or replace function public.protect_channel_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.slug is distinct from old.slug
       or new.status is distinct from old.status
       or new.is_emergency is distinct from old.is_emergency
       or new.has_voice_room is distinct from old.has_voice_room
       or new.sort_order is distinct from old.sort_order
       or new.created_by is distinct from old.created_by then
      raise exception 'Apenas administradores podem alterar esta configuração do canal'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger channels_protect before update on public.channels
  for each row execute function public.protect_channel_columns();

-- Responsáveis de canal têm de ser coordenadores ou administradores.
create or replace function public.validate_channel_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.member_role = 'lead' and not exists (
    select 1 from public.profiles
    where id = new.user_id and role in ('admin', 'coordinator')
  ) then
    raise exception 'Só coordenadores ou administradores podem ser responsáveis de canal'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger channel_members_validate before insert or update on public.channel_members
  for each row execute function public.validate_channel_member();

-- Mensagens: hora definida pelo servidor, resposta no mesmo canal, limite de envio.
create or replace function public.before_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recent_count integer;
begin
  new.created_at := now();
  new.body := btrim(new.body);

  if new.reply_to_id is not null and not exists (
    select 1 from public.messages
    where id = new.reply_to_id and channel_id = new.channel_id
  ) then
    raise exception 'A mensagem respondida não pertence a este canal' using errcode = '23514';
  end if;

  if new.author_id is not null then
    select count(*) into recent_count
    from public.messages
    where author_id = new.author_id
      and created_at > now() - interval '10 seconds';

    if recent_count >= 15 then
      raise exception 'RATE_LIMITED: demasiadas mensagens em pouco tempo'
        using errcode = 'P0001', hint = 'Aguarde alguns segundos e tente novamente.';
    end if;
  end if;

  return new;
end;
$$;

create trigger messages_before_insert before insert on public.messages
  for each row execute function public.before_message_insert();

-- Auditoria genérica
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_entity_id text;
begin
  -- Perfis: só interessa auditar mudanças de papel/estado.
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (v_old ->> 'role') is not distinct from (v_new ->> 'role')
     and (v_old ->> 'is_active') is not distinct from (v_new ->> 'is_active') then
    return null;
  end if;

  v_entity_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    concat_ws(':', coalesce(v_new, v_old) ->> 'channel_id',
                   coalesce(v_new, v_old) ->> 'team_id',
                   coalesce(v_new, v_old) ->> 'user_id')
  );

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
  );
  return null;
end;
$$;

create trigger audit_profiles after update on public.profiles
  for each row execute function public.log_activity();
create trigger audit_teams after insert or update or delete on public.teams
  for each row execute function public.log_activity();
create trigger audit_team_members after insert or update or delete on public.team_members
  for each row execute function public.log_activity();
create trigger audit_channels after insert or update or delete on public.channels
  for each row execute function public.log_activity();
-- last_read_at muda constantemente: auditar só alterações de permissões.
create trigger audit_channel_members_ins_del after insert or delete on public.channel_members
  for each row execute function public.log_activity();
create trigger audit_channel_members_upd after update on public.channel_members
  for each row
  when (old.member_role is distinct from new.member_role or old.can_post is distinct from new.can_post)
  execute function public.log_activity();

-- =============================================================================
-- RPCs
-- =============================================================================

-- Envio idempotente: repetir o mesmo client_id devolve a mesma mensagem.
-- SECURITY INVOKER => as políticas RLS de INSERT/SELECT aplicam-se.
create or replace function public.send_message(
  p_channel_id uuid,
  p_client_id uuid,
  p_body text,
  p_kind public.message_kind default 'text',
  p_reply_to_id uuid default null
)
returns public.messages
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.messages;
begin
  if p_kind = 'system' then
    raise exception 'Tipo de mensagem inválido' using errcode = '42501';
  end if;

  insert into public.messages (channel_id, author_id, client_id, body, kind, reply_to_id)
  values (p_channel_id, (select auth.uid()), p_client_id, p_body, p_kind, p_reply_to_id)
  on conflict on constraint messages_author_client_uniq do nothing;

  select * into v_row
  from public.messages
  where author_id = (select auth.uid()) and client_id = p_client_id;

  if v_row.channel_id is distinct from p_channel_id then
    raise exception 'client_id já utilizado noutro canal' using errcode = '23505';
  end if;

  return v_row;
end;
$$;

-- Marca o canal como lido pelo utilizador atual.
create or replace function public.mark_channel_read(p_channel_id uuid)
returns timestamptz
language sql security definer set search_path = '' as $$
  update public.channel_members
     set last_read_at = greatest(last_read_at, now())
   where channel_id = p_channel_id
     and user_id = (select auth.uid())
  returning last_read_at;
$$;

-- Contagem de não lidas por canal do utilizador atual.
create or replace function public.get_unread_counts()
returns table (channel_id uuid, unread bigint, last_message_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select
    cm.channel_id,
    count(m.id) filter (
      where m.created_at > cm.last_read_at
        and m.author_id is distinct from (select auth.uid())
    ) as unread,
    max(m.created_at) as last_message_at
  from public.channel_members cm
  left join public.messages m on m.channel_id = cm.channel_id
  where cm.user_id = (select auth.uid())
  group by cm.channel_id;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.teams           enable row level security;
alter table public.team_members    enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;
alter table public.activity_logs   enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or (public.is_active_user() and public.shares_channel_with(id))
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- teams / team_members
create policy teams_select on public.teams for select to authenticated
  using (public.is_active_user());
create policy teams_admin_all on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy team_members_select on public.team_members for select to authenticated
  using (public.is_active_user());
create policy team_members_admin_all on public.team_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- channels
create policy channels_select on public.channels for select to authenticated
  using (public.can_view_channel(id));
create policy channels_insert_admin on public.channels for insert to authenticated
  with check (public.is_admin());
create policy channels_update on public.channels for update to authenticated
  using (public.is_admin() or public.is_channel_lead(id))
  with check (public.is_admin() or public.is_channel_lead(id));
create policy channels_delete_admin on public.channels for delete to authenticated
  using (public.is_admin());

-- channel_members
create policy channel_members_select on public.channel_members for select to authenticated
  using (public.can_view_channel(channel_id));
create policy channel_members_insert on public.channel_members for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_channel_lead(channel_id) and member_role = 'member')
  );
create policy channel_members_update on public.channel_members for update to authenticated
  using (
    public.is_admin()
    or (public.is_channel_lead(channel_id) and member_role = 'member')
  )
  with check (
    public.is_admin()
    or (public.is_channel_lead(channel_id) and member_role = 'member')
  );
create policy channel_members_delete on public.channel_members for delete to authenticated
  using (
    public.is_admin()
    or (public.is_channel_lead(channel_id) and member_role = 'member')
  );

-- messages (imutáveis na Fase 1: sem UPDATE/DELETE para clientes)
create policy messages_select on public.messages for select to authenticated
  using (public.can_view_channel(channel_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and kind <> 'system'
    and public.can_post(channel_id)
  );

-- activity_logs (só leitura para administradores)
create policy activity_logs_select_admin on public.activity_logs for select to authenticated
  using (public.is_admin());

-- =============================================================================
-- Privilégios: anon não tem acesso a nada; clientes não editam a auditoria.
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.activity_logs from authenticated;
revoke update, delete, truncate on public.messages from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_active_user(),
  public.is_admin(),
  public.is_channel_member(uuid),
  public.is_channel_lead(uuid),
  public.can_view_channel(uuid),
  public.can_post(uuid),
  public.shares_channel_with(uuid),
  public.send_message(uuid, uuid, text, public.message_kind, uuid),
  public.mark_channel_read(uuid),
  public.get_unread_counts()
to authenticated;

-- Realtime: ver 20261104000003_fase1_realtime.sql (Broadcast privado).
