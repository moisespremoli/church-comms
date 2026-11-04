# Church Comms: arquitetura concreta e relatório da Fase 1

Este documento aplica o documento de arquitetura original ao código existente e regista o que foi
entregue na Fase 1, como foi testado, o que falta e o que tem de ser configurado fora do código.

## 1. Auditoria do repositório (passo zero)

| Item | Encontrado |
| --- | --- |
| Repositório | `Hello-World`: README de aula, `site-exemplo/index.html` (HTML estático) e `plugins/one-knob-phatter` (protótipo HTML) |
| Package manager / framework | Nenhum |
| Variáveis de ambiente / integrações | Nenhuma |
| Conclusão | Não havia stack estabelecida, por isso usou-se a stack recomendada. A app vive em `church-comms/`, isolada do resto do repositório, que não foi alterado. |

## 2. Decisões tomadas e porquê

| Decisão | Justificação |
| --- | --- |
| **Next.js 16** com `cacheComponents: false` | Quase todos os ecrãs dependem da sessão e de dados em tempo real por utilizador. Não há "static shell" útil a pré-renderizar, e o modelo dinâmico clássico é mais simples e previsível. |
| `src/proxy.ts` (antigo *middleware*) | Renova os cookies de sessão do Supabase e redireciona para `/login`. É só uma verificação otimista: a autorização real está no DAL (`src/lib/auth.ts`) e na RLS. |
| **Realtime Broadcast privado** em vez de `postgres_changes` | Com `postgres_changes`, cada INSERT é avaliado contra a RLS para cada subscritor, o que não escala bem para 200–300 pessoas e ~1.000 mensagens/min. Aqui um trigger publica **uma vez** no tópico `channel:<id>`, e a autorização acontece quando o cliente entra no tópico (políticas em `realtime.messages`). |
| **Hub único de Realtime** (`realtime-hub.tsx`) | O `realtime-js` reutiliza canais com o mesmo tópico. Um único dono por tópico evita que o painel e a vista de canal se cancelem mutuamente, e centraliza a reconexão. |
| Envio idempotente (`send_message` + `client_id`) | A cópia otimista, a resposta da RPC, o Broadcast e a sincronização pós-reconexão colapsam na mesma mensagem: `unique(author_id, client_id)` no servidor e `mergeMessages` no cliente. Repetir um envio nunca duplica. |
| Papel como `enum` em `profiles` (sem tabela `permissions`) | Os três papéis são fixos na Fase 1. A granularidade fina por canal está em `channel_members` (`member_role`, `can_post`). Uma tabela de permissões genérica pode entrar na Fase 4, se for preciso. |
| Email não copiado para `profiles` | Minimização de dados (RGPD): os colegas veem o nome, e só a administração vê emails (lidos no servidor com a chave secreta). |
| Hora das mensagens definida pelo servidor | Evita mensagens antedatadas e problemas de relógio entre dispositivos. A sincronização usa sempre timestamps do servidor como cursor. |
| `lucide-react` | Ícones consistentes e acessíveis, sem desenhar SVGs à mão. É a única dependência de UI acrescentada. |
| `supabase` (CLI, devDependency) | Stack local completa em Docker (Auth, Realtime, Mailpit) para desenvolvimento e E2E sem conta cloud. |

## 3. Separação de domínios

```
┌──────────── Dispositivos (PWA) ────────────┐
│ Painel · Canais · Perfil · Administração    │  src/app
│ Hub Realtime (Broadcast + Presence)         │  src/components/realtime
└───────────────┬────────────────────────────┘
                │ HTTPS (PostgREST/RPC) · WSS (Realtime) · cookies de sessão
┌───────────────┴────────────────────────────┐
│ Next.js servidor: proxy, DAL, Server Actions│  src/proxy.ts, src/lib/auth.ts
│ (chave secreta só em src/lib/supabase/admin)│
└───────────────┬────────────────────────────┘
┌───────────────┴────────────────────────────┐
│ Supabase: Auth · Postgres+RLS · Realtime    │  supabase/migrations
└────────────────────────────────────────────┘
Fases seguintes (contratos em src/domains/):
  alerts/ (Fase 2) · notifications/ Web Push + fila (Fase 2) · audio/ LiveKit (Fase 3)
```

## 4. Modelo de dados (Fase 1)

| Tabela | Finalidade | Notas de segurança |
| --- | --- | --- |
| `profiles` | Nome, avatar, papel, estado | Trigger impede alterar papel/estado sem ser admin e garante ≥1 admin ativo. Visível ao próprio, a admins e a colegas de canal. |
| `teams`, `team_members` | Equipas operacionais | Leitura para utilizadores ativos; escrita só admin. |
| `channels` | Canais (slug, ícone, cor, estado, emergência, sala de voz) | Visível a membros e admins. Responsáveis editam só a apresentação. |
| `channel_members` | Pertença, função (`lead`/`member`), `can_post`, `last_read_at` | Responsáveis gerem membros comuns do seu canal. Só coordenadores/admins podem ser responsáveis. |
| `messages` | Mensagens persistentes | Imutáveis para clientes (sem UPDATE/DELETE). Limite de 15 mensagens/10 s por autor. Pesquisa de texto em português (GIN). |
| `activity_logs` | Auditoria | Escrita só por triggers; leitura só por admins. |

RPCs: `send_message`, `mark_channel_read`, `get_unread_counts`. As funções auxiliares de permissão são
`SECURITY DEFINER` com `search_path = ''`. O `anon` não tem acesso a tabelas nem a funções.

Estados de mensagem mostrados na UI: **A enviar…**, **Enviada** (persistida no servidor) e **Não enviada**
(com Repetir e reenvio automático). Não há "entregue/lida" por mensagem na Fase 1, porque não é
tecnicamente confirmável sem recibos (`message_receipts` fica para quando for necessário). As não lidas
por canal vêm de `last_read_at`.

## 5. Testes executados

| Suite | Onde | Resultado |
| --- | --- | --- |
| Unitários (`npm test`) | merge/dedupe, estados de envio, cursor, validação, redirect seguro, formatação | **29/29** |
| RLS/autorização (`npm run test:db`) | PostgreSQL 16 com stub mínimo de `auth`/`realtime` | **65/65** |
| A mesma suite de RLS | Supabase local real (Postgres 17, `realtime.send` real) | **65/65** |
| E2E (`tests/e2e/fase1.e2e.mjs`) | App em produção + Supabase local (Auth, REST, Realtime, Mailpit), 3 sessões de browser | **28/28** |

O E2E cobre: admin cria equipa e utilizadores com canais; isolamento por canal (lista, URL direto,
área de administração); mensagem em tempo real entre dispositivos (~100 ms localmente, incluindo a UI);
persistência; não lidas em tempo real; marcar como lido; perda de rede indicada; mensagens perdidas
offline sincronizadas uma única vez; envio offline com reenvio automático sem duplicar; pesquisa;
recuperação de palavra-passe por email; desativação de conta; registo na auditoria.

**Não executado (fica para a Fase 4):** testes de carga para 200–300 utilizadores / 1.000 mensagens por
minuto, e testes em iPhone/Android reais. Os ~100 ms medidos são locais e não garantem latência em
produção.

## 6. Limitações conhecidas

- **Segundo plano (iOS/PWA)**: com o ecrã bloqueado, o socket pode ser suspenso. Ao voltar ao primeiro
  plano, o hub ressincroniza. Notificações em segundo plano chegam com Web Push na Fase 2.
- Novas pertenças a canais aparecem depois de recarregar ou navegar (o hub subscreve os canais que o
  servidor devolve no carregamento).
- A fila de envio pendente vive em memória: fechar a app com uma mensagem "Não enviada" descarta-a.
- Sem tema claro (o documento indica o escuro como principal; o claro era opcional).
- O Service Worker não guarda páginas nem dados, para não deixar dados pessoais em cache. Offline mostra
  `/offline.html`.

## 7. O que precisa de conta, plano ou configuração externa

| Serviço | Fase | O que validar antes de produção |
| --- | --- | --- |
| Supabase | 1 | Plano com limites de ligações Realtime simultâneas e mensagens/s adequados a 300 utilizadores (o plano gratuito não serve para produção). Região UE, backups/PITR, SMTP próprio. |
| Alojamento Next.js com HTTPS | 1 | Domínio próprio. A PWA exige HTTPS. |
| Chaves VAPID (Web Push) | 2 | Geradas e guardadas só no servidor. |
| Worker + fila durável | 2 | Para tentativas e escalamento de alertas (por exemplo pg_cron + Edge Functions, ou um worker dedicado). |
| LiveKit Cloud ou self-hosted | 3 | Limites de participantes, região, TURN, egress e custos. |

## 8. Próximos passos (Fase 2: Operação)

1. Tabela `quick_messages` + botões grandes por canal (o tipo `kind = 'quick'` já existe nas mensagens).
2. `emergency_alerts` e `emergency_acknowledgements`, com o fluxo "persistir → enfileirar → notificar →
   reconhecer → escalar → resolver", e estados técnicos separados do reconhecimento humano.
3. `devices` (subscrições Web Push), handlers `push`/`notificationclick` em `public/sw.js`, e pedido de
   permissão contextual.
4. `notifications` (fila/tentativas) e um worker de escalamento.
5. Testes: RLS dos alertas, escalamento com relógio controlado, e E2E com dispositivo offline.
