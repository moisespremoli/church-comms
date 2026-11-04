-- =============================================================================
-- Testes de autorização / RLS da Fase 1.
-- Executar com: npm run test:db   (ver scripts/test-db.sh)
-- Cada asserção falhada aborta o script com erro (ON_ERROR_STOP).
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.ok(cond boolean, description text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FALHOU: %', description;
  end if;
  raise notice 'ok - %', description;
end;
$$;

-- Executa SQL e exige que falhe (opcionalmente com um texto na mensagem).
create function tests.throws(stmt text, description text, expected text default null) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if expected is not null and position(expected in sqlerrm) = 0 then
      raise exception 'FALHOU: % (erro inesperado: %)', description, sqlerrm;
    end if;
    raise notice 'ok - %', description;
    return;
  end;
  raise exception 'FALHOU: % (não lançou erro)', description;
end;
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Utilizadores de teste
\set ADMIN   '''00000000-0000-4000-8000-00000000000a'''
\set COORD   '''00000000-0000-4000-8000-00000000000c'''
\set M1      '''00000000-0000-4000-8000-0000000000e1'''
\set M2      '''00000000-0000-4000-8000-0000000000e2'''
\set INACT   '''00000000-0000-4000-8000-0000000000f0'''

\set login_admin 'reset role; select set_config(''request.jwt.claims'', json_build_object(''sub'', ' :ADMIN ', ''role'', ''authenticated'')::text, false); set role authenticated;'
\set login_coord 'reset role; select set_config(''request.jwt.claims'', json_build_object(''sub'', ' :COORD ', ''role'', ''authenticated'')::text, false); set role authenticated;'
\set login_m1    'reset role; select set_config(''request.jwt.claims'', json_build_object(''sub'', ' :M1 ', ''role'', ''authenticated'')::text, false); set role authenticated;'
\set login_m2    'reset role; select set_config(''request.jwt.claims'', json_build_object(''sub'', ' :M2 ', ''role'', ''authenticated'')::text, false); set role authenticated;'
\set login_inact 'reset role; select set_config(''request.jwt.claims'', json_build_object(''sub'', ' :INACT ', ''role'', ''authenticated'')::text, false); set role authenticated;'
\set login_anon  'reset role; select set_config(''request.jwt.claims'', '''', false); set role anon;'
\set as_backend  'reset role; select set_config(''request.jwt.claims'', '''', false);'

-- -----------------------------------------------------------------------------
-- Preparação (como backend / service role)
-- -----------------------------------------------------------------------------
:as_backend
insert into auth.users (id, email, raw_user_meta_data) values
  (:ADMIN, 'admin@teste.local', '{"full_name":"Admin Teste"}'),
  (:COORD, 'coord@teste.local', '{"full_name":"Coordenador Teste"}'),
  (:M1,    'm1@teste.local',    '{"full_name":"Membro Um"}'),
  (:M2,    'm2@teste.local',    '{"full_name":"Membro Dois"}'),
  (:INACT, 'inativo@teste.local', '{}');

select tests.ok((select count(*) from public.profiles) = 5, 'trigger cria perfil para cada utilizador de auth');
select tests.ok((select full_name from public.profiles where id = :M1) = 'Membro Um', 'nome do perfil vem dos metadados');
select tests.ok((select role from public.profiles where id = :M1) = 'member', 'papel por omissão é member');
select tests.ok((select count(*) from public.channels) = 7, 'canais iniciais criados');

-- O backend (sem auth.uid) pode definir papéis: arranque do primeiro admin.
update public.profiles set role = 'admin' where id = :ADMIN;
update public.profiles set role = 'coordinator' where id = :COORD;
update public.profiles set is_active = false where id = :INACT;

-- -----------------------------------------------------------------------------
-- Administrador: gere canais e membros
-- -----------------------------------------------------------------------------
:login_admin
select tests.ok((select count(*) from public.channels) = 7, 'admin vê todos os canais sem ser membro');

insert into public.channel_members (channel_id, user_id, member_role)
select id, :COORD::uuid, 'lead' from public.channels where slug = 'palco-mesa';
insert into public.channel_members (channel_id, user_id)
select id, :M2::uuid from public.channels where slug = 'palco-mesa';
insert into public.channel_members (channel_id, user_id)
select id, :M1::uuid from public.channels where slug = 'seguranca';
insert into public.channel_members (channel_id, user_id)
select id, :INACT::uuid from public.channels where slug = 'seguranca';

select tests.throws(
  $$insert into public.channel_members (channel_id, user_id, member_role)
    select id, '00000000-0000-4000-8000-0000000000e1', 'lead' from public.channels where slug = 'louvor'$$,
  'um membro comum não pode ser responsável de canal',
  'responsáveis'
);

insert into public.channels (slug, name) values ('teste-admin', 'Teste');
select tests.ok(exists (select 1 from public.channels where slug = 'teste-admin'), 'admin cria canal');

select tests.ok(
  (select count(*) from public.activity_logs where entity_type = 'channel_members') >= 4,
  'alterações de membros ficam na auditoria'
);
select tests.ok(
  (select count(*) from public.activity_logs where entity_type = 'profiles') = 3,
  'alterações de papel/estado ficam na auditoria'
);
select tests.ok(
  (select actor_id from public.activity_logs where entity_type = 'channels' order by id desc limit 1) = :ADMIN,
  'auditoria regista quem fez a ação'
);

-- Mensagem do admin no canal SEGURANÇA (para testar não lidas)
select tests.ok(
  (select (public.send_message(id, gen_random_uuid(), 'Mensagem do admin')).id is not null
   from public.channels where slug = 'seguranca'),
  'admin pode publicar em qualquer canal ativo'
);

-- -----------------------------------------------------------------------------
-- Membro 1: só vê e escreve nos seus canais
-- -----------------------------------------------------------------------------
:login_m1
select tests.ok((select count(*) from public.channels) = 1, 'membro só vê os canais atribuídos');
select tests.ok((select slug from public.channels) = 'seguranca', 'membro vê o canal SEGURANÇA');
select tests.ok(
  (select count(*) from public.messages m join public.channels c on c.id = m.channel_id where c.slug = 'palco-mesa') = 0,
  'membro não lê mensagens de canais não autorizados'
);
select tests.throws(
  $$select public.send_message('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'x')$$,
  'membro não escreve em canal inexistente/não autorizado',
  'row-level security'
);

-- Tentar escrever em PALCO ↔ MESA (id obtido como backend)
:as_backend
select id as palco_id from public.channels where slug = 'palco-mesa' \gset
select id as seg_id from public.channels where slug = 'seguranca' \gset
:login_m1
select tests.throws(
  format($$select public.send_message(%L, gen_random_uuid(), 'intrusão')$$, :'palco_id'),
  'membro não escreve em canal não autorizado (RPC)',
  'row-level security'
);
select tests.throws(
  format($$insert into public.messages (channel_id, author_id, client_id, body) values (%L, auth.uid(), gen_random_uuid(), 'x')$$, :'palco_id'),
  'membro não escreve em canal não autorizado (INSERT direto)',
  'row-level security'
);
select tests.throws(
  format($$insert into public.messages (channel_id, author_id, client_id, body) values (%L, %L, gen_random_uuid(), 'falsificado')$$, :'seg_id', :M2),
  'membro não publica em nome de outra pessoa',
  'row-level security'
);
select tests.throws(
  format($$insert into public.messages (channel_id, author_id, client_id, body, kind) values (%L, auth.uid(), gen_random_uuid(), 'sistema', 'system')$$, :'seg_id'),
  'membro não cria mensagens de sistema',
  'row-level security'
);

-- Envio idempotente
select tests.ok(
  (select (public.send_message(:'seg_id', '11111111-1111-4111-8111-111111111111', '  Verificar entrada  ')).body) = 'Verificar entrada',
  'membro envia mensagem no seu canal (texto normalizado)'
);
select tests.ok(
  (select (public.send_message(:'seg_id', '11111111-1111-4111-8111-111111111111', 'Verificar entrada')).id)
  = (select id from public.messages where client_id = '11111111-1111-4111-8111-111111111111'),
  'reenviar o mesmo client_id devolve a mesma mensagem'
);
select tests.ok(
  (select count(*) from public.messages where client_id = '11111111-1111-4111-8111-111111111111') = 1,
  'reenvio após reconexão não duplica mensagens'
);
select tests.throws(
  format($$select public.send_message(%L, gen_random_uuid(), '   ')$$, :'seg_id'),
  'mensagens vazias são rejeitadas',
  'check constraint'
);
select tests.throws(
  format($$select public.send_message(%L, gen_random_uuid(), repeat('a', 2001))$$, :'seg_id'),
  'mensagens demasiado longas são rejeitadas',
  'check constraint'
);

-- Hora definida pelo servidor
insert into public.messages (channel_id, author_id, client_id, body, created_at)
values (:'seg_id', auth.uid(), '22222222-2222-4222-8222-222222222222', 'data falsa', '2000-01-01');
select tests.ok(
  (select created_at > now() - interval '1 minute' from public.messages where client_id = '22222222-2222-4222-8222-222222222222'),
  'created_at é definido pelo servidor'
);

-- Sem edição/remoção pelo cliente
select tests.throws(
  $$update public.messages set body = 'editado'$$,
  'mensagens não podem ser editadas pelo cliente',
  'permission denied'
);
select tests.throws(
  $$delete from public.messages$$,
  'mensagens não podem ser apagadas pelo cliente',
  'permission denied'
);

-- Não lidas
select tests.ok(
  (select unread from public.get_unread_counts() where channel_id = :'seg_id') = 1,
  'conta 1 não lida (a do admin; as próprias não contam)'
);
select public.mark_channel_read(:'seg_id');
select tests.ok(
  (select unread from public.get_unread_counts() where channel_id = :'seg_id') = 0,
  'marcar como lido zera as não lidas'
);

-- Perfil: pode editar o nome, não o papel nem o estado
update public.profiles set full_name = 'Membro Um (editado)' where id = auth.uid();
select tests.ok((select full_name from public.profiles where id = auth.uid()) = 'Membro Um (editado)', 'membro edita o próprio nome');
select tests.throws(
  $$update public.profiles set role = 'admin' where id = auth.uid()$$,
  'membro não se promove a admin',
  'Sem permissão'
);
select tests.throws(
  $$update public.profiles set is_active = false where id = auth.uid()$$,
  'membro não altera o próprio estado',
  'Sem permissão'
);
update public.profiles set full_name = 'hack' where id = :M2;
select tests.ok(
  (select full_name from public.profiles where id = :M2) is null,
  'membro não edita (nem vê) o perfil de quem não partilha canal'
);
select tests.ok(
  (select count(*) from public.profiles) = 2,
  'membro vê o próprio perfil e colegas de canal (inclui o inativo do mesmo canal)'
);
select tests.ok((select count(*) from public.activity_logs) = 0, 'membro não lê a auditoria');
select tests.throws(
  $$insert into public.activity_logs (action, entity_type) values ('forjar', 'x')$$,
  'membro não escreve na auditoria',
  'permission denied'
);
select tests.throws(
  format($$insert into public.channel_members (channel_id, user_id) values (%L, auth.uid())$$, :'palco_id'),
  'membro não se adiciona a canais',
  'row-level security'
);
select tests.throws(
  $$insert into public.channels (slug, name) values ('pirata', 'Pirata')$$,
  'membro não cria canais',
  'row-level security'
);

-- Limite de frequência (15 mensagens / 10 s, já enviou 2)
select tests.throws(
  format($t$do $b$ begin for i in 1..20 loop perform public.send_message(%L, gen_random_uuid(), 'spam ' || i); end loop; end $b$$t$, :'seg_id'),
  'limite de frequência de mensagens',
  'RATE_LIMITED'
);

-- -----------------------------------------------------------------------------
-- Membro 2: isolado do canal SEGURANÇA
-- -----------------------------------------------------------------------------
:login_m2
select tests.ok(
  (select count(*) from public.messages where channel_id = :'seg_id') = 0,
  'membro de outro canal não lê mensagens de SEGURANÇA'
);
select tests.ok(
  (select count(*) from public.channel_members where channel_id = :'seg_id') = 0,
  'membro de outro canal não vê membros de SEGURANÇA'
);

-- -----------------------------------------------------------------------------
-- Coordenador responsável de PALCO ↔ MESA
-- -----------------------------------------------------------------------------
:login_coord
insert into public.channel_members (channel_id, user_id) values (:'palco_id', :M1);
select tests.ok(
  exists (select 1 from public.channel_members where channel_id = :'palco_id' and user_id = :M1),
  'responsável adiciona membros ao seu canal'
);
select tests.throws(
  format($$insert into public.channel_members (channel_id, user_id) values (%L, %L)$$, :'seg_id', :M2),
  'responsável não gere canais que não lhe foram delegados',
  'row-level security'
);
select tests.throws(
  format($$update public.channel_members set member_role = 'lead' where channel_id = %L and user_id = %L$$, :'palco_id', :M1),
  'responsável não promove outros a responsável'
);
delete from public.channel_members where channel_id = :'palco_id' and user_id = :COORD;
select tests.ok(
  exists (select 1 from public.channel_members where channel_id = :'palco_id' and user_id = :COORD),
  'responsável não remove responsáveis (DELETE filtrado pela RLS)'
);
update public.channels set description = 'Nova descrição' where id = :'palco_id';
select tests.ok(
  (select description from public.channels where id = :'palco_id') = 'Nova descrição',
  'responsável edita a apresentação do canal'
);
select tests.throws(
  format($$update public.channels set status = 'archived' where id = %L$$, :'palco_id'),
  'responsável não arquiva canais',
  'Apenas administradores'
);

-- -----------------------------------------------------------------------------
-- Utilizador desativado
-- -----------------------------------------------------------------------------
:login_inact
select tests.ok((select count(*) from public.channels) = 0, 'utilizador desativado não vê canais');
select tests.ok((select count(*) from public.messages) = 0, 'utilizador desativado não lê mensagens');
select tests.throws(
  format($$select public.send_message(%L, gen_random_uuid(), 'olá')$$, :'seg_id'),
  'utilizador desativado não envia mensagens',
  'row-level security'
);

-- -----------------------------------------------------------------------------
-- Anónimo
-- -----------------------------------------------------------------------------
:login_anon
select tests.throws($$select * from public.channels$$, 'anónimo não acede a canais', 'permission denied');
select tests.throws($$select * from public.messages$$, 'anónimo não acede a mensagens', 'permission denied');
select tests.throws($$select public.get_unread_counts()$$, 'anónimo não executa RPCs', 'permission denied');

-- -----------------------------------------------------------------------------
-- Administrador: salvaguardas
-- -----------------------------------------------------------------------------
:login_admin
select tests.throws(
  format($$update public.profiles set role = 'member' where id = %L$$, :ADMIN),
  'o último administrador ativo não pode ser despromovido',
  'pelo menos um administrador'
);
update public.channels set status = 'archived' where id = :'seg_id';
:login_m1
select tests.throws(
  format($$select public.send_message(%L, gen_random_uuid(), 'canal arquivado')$$, :'seg_id'),
  'não se publica em canais arquivados',
  'row-level security'
);

-- -----------------------------------------------------------------------------
-- Realtime Broadcast privado
-- -----------------------------------------------------------------------------
:as_backend
select tests.ok(
  (select count(*) from realtime.messages where topic = 'channel:' || :'seg_id' and event = 'message.created') >= 3,
  'cada mensagem nova é publicada no tópico do canal'
);
select tests.ok(
  (select bool_and(not (payload -> 'message' ? 'search')) from realtime.messages),
  'payload de Broadcast não inclui colunas internas'
);

:login_m1
select set_config('realtime.topic', 'channel:' || :'seg_id', false);
select tests.ok((select count(*) from realtime.messages) >= 3, 'membro recebe Broadcast do seu canal');
:login_m2
select set_config('realtime.topic', 'channel:' || :'seg_id', false);
select tests.ok((select count(*) from realtime.messages) = 0, 'membro não recebe Broadcast de outro canal');
select set_config('realtime.topic', 'channel:não-é-uuid', false);
select tests.ok((select count(*) from realtime.messages) = 0, 'tópico inválido não dá acesso');

select set_config('realtime.topic', 'presence:online', false);
insert into realtime.messages (topic, extension, payload) values ('presence:online', 'presence', '{}');
select tests.ok(true, 'utilizador ativo regista presença');
:login_inact
select set_config('realtime.topic', 'presence:online', false);
select tests.throws(
  $$insert into realtime.messages (topic, extension, payload) values ('presence:online', 'presence', '{}')$$,
  'utilizador desativado não regista presença',
  'row-level security'
);
select tests.throws(
  $$insert into realtime.messages (topic, extension, payload) values ('presence:online', 'broadcast', '{}')$$,
  'clientes não publicam Broadcast diretamente',
  'row-level security'
);

reset role;
\echo 'Todos os testes RLS da Fase 1 passaram.'
