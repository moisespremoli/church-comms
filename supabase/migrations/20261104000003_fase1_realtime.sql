-- =============================================================================
-- Tempo real via Supabase Realtime Broadcast (canais privados).
--
-- Porquê Broadcast e não postgres_changes: com postgres_changes cada INSERT é
-- avaliado contra a RLS para cada subscritor, o que escala mal para 200–300
-- utilizadores e ~1.000 mensagens/min. Aqui a base de dados publica UMA vez no
-- tópico do canal e a autorização é feita quando o cliente entra no tópico
-- (políticas em realtime.messages).
--
-- Tópicos:
--   channel:<uuid>    evento 'message.created' { message: <linha sem 'search'> }
--   presence:online   presença dos utilizadores ativos
--
-- Num PostgreSQL sem o esquema 'realtime' (testes locais) esta migração só
-- cria as funções auxiliares.
-- =============================================================================

create or replace function public.try_uuid(p_value text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;
revoke execute on function public.try_uuid(text) from public, anon;
grant execute on function public.try_uuid(text) to authenticated;

create or replace function public.can_join_realtime_topic(p_topic text, p_extension text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_topic like 'channel:%' and p_extension = 'broadcast' then
      public.can_view_channel(public.try_uuid(substr(p_topic, 9)))
    when p_topic = 'presence:online' and p_extension = 'presence' then
      public.is_active_user()
    else false
  end;
$$;
revoke execute on function public.can_join_realtime_topic(text, text) from public, anon;
grant execute on function public.can_join_realtime_topic(text, text) to authenticated;

do $do$
begin
  if not exists (select 1 from pg_namespace where nspname = 'realtime') then
    raise notice 'Esquema realtime inexistente: políticas e trigger de Broadcast ignorados.';
    return;
  end if;

  -- Publicação de mensagens novas no tópico do canal.
  create or replace function public.broadcast_message_created()
  returns trigger language plpgsql security definer set search_path = '' as $fn$
  begin
    begin
      perform realtime.send(
        jsonb_build_object('message', to_jsonb(new) - 'search'),
        'message.created',
        'channel:' || new.channel_id::text,
        true
      );
    exception when others then
      -- Uma falha do Realtime nunca impede o registo da mensagem;
      -- os clientes recuperam pelo histórico ao reconectar.
      raise warning 'broadcast_message_created falhou: %', sqlerrm;
    end;
    return null;
  end;
  $fn$;

  drop trigger if exists messages_broadcast on public.messages;
  create trigger messages_broadcast after insert on public.messages
    for each row execute function public.broadcast_message_created();

  -- Autorização para entrar em tópicos privados.
  drop policy if exists church_comms_realtime_read on realtime.messages;
  create policy church_comms_realtime_read on realtime.messages
    for select to authenticated
    using (public.can_join_realtime_topic((select realtime.topic()), extension));

  drop policy if exists church_comms_realtime_presence on realtime.messages;
  create policy church_comms_realtime_presence on realtime.messages
    for insert to authenticated
    with check (
      extension = 'presence'
      and public.can_join_realtime_topic((select realtime.topic()), extension)
    );
end;
$do$;
