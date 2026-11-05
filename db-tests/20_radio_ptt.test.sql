-- =============================================================================
-- Testes do turno de fala (Push-to-Talk). Corre depois de 10_rls_fase1, que
-- cria os utilizadores e deixa em PALCO ↔ MESA: COORD (responsável), M1 e M2.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

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
\set as_backend  'reset role; select set_config(''request.jwt.claims'', '''', false);'

:as_backend
select id as palco_id from public.channels where slug = 'palco-mesa' \gset
select id as louvor_id from public.channels where slug = 'louvor' \gset
select tests.ok((select count(*) from public.channels where has_voice_room) = 7, 'canais iniciais têm sala de rádio');

-- M2 fala
:login_m2
select tests.ok((select granted from public.request_floor(:'palco_id')), 'membro obtém o turno com o canal livre');
select tests.ok((select reason from public.request_floor(:'palco_id')) = 'renewed', 'o próprio transmissor renova o turno');
select tests.ok((select speaker_id from public.ptt_floor where channel_id = :'palco_id') = :M2, 'toda a gente do canal vê quem está a falar');

-- M1 tenta falar ao mesmo tempo
:login_m1
select tests.ok(not (select granted from public.request_floor(:'palco_id')), 'segundo membro não fala ao mesmo tempo (modo exclusivo)');
select tests.ok((select reason from public.request_floor(:'palco_id')) = 'busy', 'motivo: canal ocupado');
select tests.ok(not (select granted from public.request_floor(:'palco_id', true)), 'membro comum não pode interromper');
select tests.ok(not public.release_floor(:'palco_id'), 'ninguém liberta o turno de outra pessoa');
select tests.throws(
  $$update public.ptt_floor set speaker_id = auth.uid()$$,
  'clientes não alteram o turno diretamente',
  'permission denied'
);
select tests.throws(
  format($$select public.request_floor(%L)$$, :'louvor_id'),
  'não se fala em canais de que não é membro',
  'Sem permissão'
);

-- Coordenador responsável interrompe com prioridade
:login_coord
select tests.ok(not (select granted from public.request_floor(:'palco_id')), 'responsável sem prioridade espera a vez');
select tests.ok(
  (select previous_speaker_id from public.request_floor(:'palco_id', true)) = :M2,
  'responsável interrompe um membro e o servidor sabe quem revogar'
);
select tests.ok((select speaker_id from public.ptt_floor where channel_id = :'palco_id') = :COORD, 'turno passa para o responsável');

-- Admin não interrompe outro responsável
:login_admin
select tests.ok(not (select granted from public.request_floor(:'palco_id', true)), 'prioridade não interrompe outro responsável');

-- Libertar
:login_coord
select tests.ok(public.release_floor(:'palco_id'), 'responsável liberta ao largar o botão');
:login_m1
select tests.ok((select granted from public.request_floor(:'palco_id')), 'canal livre: o seguinte pode falar');

-- Expiração (simulada pelo backend)
:as_backend
update public.ptt_floor set expires_at = now() - interval '1 second' where channel_id = :'palco_id';
:login_m2
select tests.ok(
  (select granted and previous_speaker_id = '00000000-0000-4000-8000-0000000000e1'::uuid
   from public.request_floor(:'palco_id')),
  'turno expirado é concedido a outra pessoa e o anterior é revogado'
);

-- Duração máxima
:as_backend
update public.ptt_floor set granted_at = now() - interval '3 minutes' where channel_id = :'palco_id';
:login_m2
select tests.ok((select reason from public.request_floor(:'palco_id')) = 'max_duration', 'transmissão contínua limitada a 2 minutos');

-- Desativado
:login_inact
select tests.throws(format($$select public.request_floor(%L)$$, :'palco_id'), 'utilizador desativado não transmite', 'Sem permissão');

-- Histórico
:as_backend
select tests.ok(
  (select count(*) from public.voice_sessions where channel_id = :'palco_id' and end_reason in ('preempted','released','expired')) >= 3,
  'histórico regista início e fim de cada transmissão'
);
:login_m1
select tests.ok((select count(*) from public.voice_sessions) = 0, 'membro comum não lê o histórico de transmissões');
:login_coord
select tests.ok((select count(*) from public.voice_sessions) > 0, 'responsável do canal lê o histórico');

reset role;
\echo 'Todos os testes do rádio (PTT) passaram.'
