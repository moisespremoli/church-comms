-- Canais iniciais definidos no documento de arquitetura (secção 3).
-- São configuração do produto, não dados fictícios. Membros são atribuídos
-- pela administração.
insert into public.channels (slug, name, description, icon, color, is_emergency, sort_order)
values
  ('palco-mesa',  'PALCO ↔ MESA', 'Comunicação entre palco, direção, som e técnicos', 'mic',        'sky',     false, 10),
  ('seguranca',   'SEGURANÇA',    'Coordenação da equipa de segurança',               'shield',     'amber',   false, 20),
  ('rececao',     'RECEÇÃO',      'Acolhimento, entradas e apoio a visitantes',       'door',       'emerald', false, 30),
  ('multimedia',  'MULTIMÉDIA',   'Câmaras, transmissão, projeção e conteúdos',       'video',      'violet',  false, 40),
  ('louvor',      'LOUVOR',       'Coordenação da equipa de louvor',                  'music',      'cyan',    false, 50),
  ('operacoes',   'OPERAÇÕES',    'Logística, manutenção e apoio geral',              'wrench',     'orange',  false, 60),
  ('emergencias', 'EMERGÊNCIAS',  'Alertas restritos aos responsáveis autorizados',   'siren',      'red',     true,  70)
on conflict (slug) do nothing;
