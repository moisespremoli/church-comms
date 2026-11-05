-- =============================================================================
-- Fase 3 (início): Rádio / Push-to-Talk sobre LiveKit.
--
-- O LiveKit transporta o áudio. Esta migração guarda QUEM tem o turno de fala
-- em cada canal. O servidor da app só dá permissão de publicar microfone no
-- LiveKit a quem tem o turno (src/app/api/radio/falar/route.ts).
--
-- Regras:
--   * um único transmissor por canal (modo exclusivo);
--   * concessão temporária: expira 30 s após o último pedido de renovação e
--     nunca dura mais de 2 min seguidos;
--   * libertação ao largar o botão, por expiração ou por interrupção;
--   * administradores e responsáveis do canal podem interromper um membro
--     comum (prioridade de coordenação), mas não outro responsável.
-- =============================================================================

-- Os canais iniciais são operacionais: todos com sala de rádio.
update public.channels set has_voice_room = true
where slug in ('palco-mesa','seguranca','rececao','multimedia','louvor','operacoes','emergencias');

create table public.ptt_floor (
  channel_id  uuid primary key references public.channels (id) on delete cascade,
  speaker_id  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz,
  expires_at  timestamptz
);

alter table public.ptt_floor enable row level security;
create policy ptt_floor_select on public.ptt_floor for select to authenticated
  using (public.can_view_channel(channel_id));
revoke insert, update, delete, truncate on public.ptt_floor from authenticated, anon;
revoke all on public.ptt_floor from anon;

-- Histórico de transmissões (auditoria operacional, sem áudio).
create table public.voice_sessions (
  id          bigint generated always as identity primary key,
  channel_id  uuid not null references public.channels (id) on delete cascade,
  speaker_id  uuid references public.profiles (id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  end_reason  text check (end_reason in ('released', 'expired', 'preempted'))
);
create index voice_sessions_channel_idx on public.voice_sessions (channel_id, started_at desc);
alter table public.voice_sessions enable row level security;
create policy voice_sessions_select on public.voice_sessions for select to authenticated
  using (public.is_admin() or public.is_channel_lead(channel_id));
revoke insert, update, delete, truncate on public.voice_sessions from authenticated, anon;
revoke all on public.voice_sessions from anon;

create or replace function public.can_preempt_floor(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_channel_lead(p_channel_id);
$$;

create or replace function public._is_priority_speaker(p_channel_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active
      and (p.role = 'admin' or exists (
        select 1 from public.channel_members cm
        where cm.channel_id = p_channel_id and cm.user_id = p_user_id and cm.member_role = 'lead'
      ))
  );
$$;

-- Pede (ou renova) o turno de fala.
create or replace function public.request_floor(p_channel_id uuid, p_preempt boolean default false)
returns table (granted boolean, speaker_id uuid, previous_speaker_id uuid, expires_at timestamptz, reason text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_row public.ptt_floor;
  v_previous uuid;
  v_end text;
begin
  if v_me is null or not public.can_post(p_channel_id) then
    raise exception 'Sem permissão para transmitir neste canal' using errcode = '42501';
  end if;
  if not exists (select 1 from public.channels where id = p_channel_id and has_voice_room) then
    raise exception 'Este canal não tem rádio' using errcode = '42501';
  end if;

  insert into public.ptt_floor (channel_id) values (p_channel_id) on conflict do nothing;
  select * into v_row from public.ptt_floor f where f.channel_id = p_channel_id for update;

  -- Renovação pelo próprio transmissor.
  if v_row.speaker_id = v_me and v_row.expires_at > now() then
    if v_row.granted_at < now() - interval '2 minutes' then
      return query select false, v_row.speaker_id, null::uuid, v_row.expires_at, 'max_duration'::text;
      return;
    end if;
    update public.ptt_floor f
       set expires_at = least(now() + interval '30 seconds', f.granted_at + interval '2 minutes')
     where f.channel_id = p_channel_id
     returning * into v_row;
    return query select true, v_me, null::uuid, v_row.expires_at, 'renewed'::text;
    return;
  end if;

  -- Ocupado por outra pessoa?
  if v_row.speaker_id is not null and v_row.speaker_id <> v_me and v_row.expires_at > now() then
    if not (p_preempt
            and public.can_preempt_floor(p_channel_id)
            and not public._is_priority_speaker(p_channel_id, v_row.speaker_id)) then
      return query select false, v_row.speaker_id, null::uuid, v_row.expires_at, 'busy'::text;
      return;
    end if;
    v_end := 'preempted';
  elsif v_row.speaker_id is not null then
    v_end := 'expired';
  end if;

  v_previous := v_row.speaker_id;
  if v_previous is not null then
    update public.voice_sessions s set ended_at = now(), end_reason = v_end
     where s.channel_id = p_channel_id and s.speaker_id = v_previous and s.ended_at is null;
  end if;

  update public.ptt_floor f
     set speaker_id = v_me, granted_at = now(), expires_at = now() + interval '30 seconds'
   where f.channel_id = p_channel_id
   returning * into v_row;
  insert into public.voice_sessions (channel_id, speaker_id) values (p_channel_id, v_me);

  return query select true, v_me,
    case when v_previous is distinct from v_me then v_previous end,
    v_row.expires_at,
    coalesce(v_end, 'granted');
end;
$$;

-- Liberta o turno (só o próprio transmissor).
create or replace function public.release_floor(p_channel_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_released boolean;
begin
  update public.ptt_floor f
     set speaker_id = null, granted_at = null, expires_at = null
   where f.channel_id = p_channel_id and f.speaker_id = v_me;
  v_released := found;
  if v_released then
    update public.voice_sessions s set ended_at = now(), end_reason = 'released'
     where s.channel_id = p_channel_id and s.speaker_id = v_me and s.ended_at is null;
  end if;
  return v_released;
end;
$$;

revoke execute on function
  public.can_preempt_floor(uuid),
  public._is_priority_speaker(uuid, uuid),
  public.request_floor(uuid, boolean),
  public.release_floor(uuid)
from public, anon;
revoke execute on function public._is_priority_speaker(uuid, uuid) from authenticated;
grant execute on function
  public.can_preempt_floor(uuid),
  public.request_floor(uuid, boolean),
  public.release_floor(uuid)
to authenticated;
