# Church Comms

Plataforma de comunicação operacional da igreja: canais de texto em tempo real, alertas prioritários,
chamadas individuais, salas de voz e Push-to-Talk, como Progressive Web App (PWA) para iPhone, Android,
tablet e computador.

> **Estado: Fase 1 (Fundamentos) concluída.** Autenticação, perfis, papéis, equipas, canais, membros,
> mensagens em tempo real, painel, administração, auditoria e PWA.
> Já existe também o **sinal luminoso** de novas mensagens e o **rádio Push-to-Talk**
> (walkie-talkie sobre LiveKit; precisa das credenciais LiveKit para funcionar).
> Alertas com confirmação (Fase 2), chamadas individuais e operação/produção (Fase 4) ainda **não** estão feitos.
> Detalhes, decisões e limitações em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

O Church Comms **não substitui** os meios oficiais de emergência (112) nem os procedimentos de
segurança da igreja.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4, ícones `lucide-react`, tema escuro de alto contraste |
| Identidade | Supabase Auth (email + palavra-passe, sem registo público) |
| Dados | PostgreSQL (Supabase) com Row Level Security em todas as tabelas |
| Tempo real | Supabase Realtime **Broadcast privado** (autorizado por RLS) + Presence |
| PWA | Manifest, ícones, Service Worker conservador, página offline |
| Testes | Vitest (unitários), SQL contra PostgreSQL (RLS), Playwright (E2E) |

## Requisitos

- Node.js 22+
- Um projeto Supabase (cloud) **ou** Docker para o Supabase local (`npx supabase start`)
- PostgreSQL 15+ local apenas se quiser correr `npm run test:db` sem Docker

## Arranque local (Supabase local, recomendado para desenvolvimento)

```bash
npm install
npx supabase start          # Postgres, Auth, REST, Realtime e Mailpit em Docker; aplica as migrações
npx supabase status         # mostra API URL e chaves locais
cp .env.example .env.local  # preencher com os valores do passo anterior
node --env-file=.env.local scripts/create-admin.mjs admin@igreja.pt "Nome do Admin" "palavra-passe-forte"
npm run dev                 # http://localhost:3000
```

Os emails locais (recuperação de palavra-passe, convites) aparecem no Mailpit: http://127.0.0.1:54324.

## Configuração num projeto Supabase (cloud)

1. **Criar o projeto** em supabase.com (região na UE, por exemplo Frankfurt, por causa do RGPD).
2. **Aplicar as migrações** de `supabase/migrations/` por ordem:
   `npx supabase link --project-ref <ref>` e depois `npx supabase db push`
   (ou colar cada ficheiro no SQL Editor).
3. **Authentication → Sign In / Providers**: desativar *Allow new users to sign up*
   (as contas são criadas pela administração). Palavra-passe mínima: 10.
4. **Authentication → URL Configuration**: *Site URL* = URL pública da app;
   adicionar `https://<domínio>/auth/confirm` a *Redirect URLs*.
5. **Authentication → Email Templates**: copiar `supabase/templates/recovery.html` e `invite.html`
   (usam `token_hash`, por isso a ligação funciona mesmo aberta noutro dispositivo).
   Configurar SMTP próprio: o SMTP de teste do Supabase tem limites muito baixos.
6. **Realtime → Settings**: desativar *Allow public access*, para que só os canais privados
   (autorizados pela RLS) sejam aceites.
7. **Variáveis de ambiente** no alojamento da app (ver `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   (só servidor) e `NEXT_PUBLIC_SITE_URL`.
8. **Primeiro administrador**: `node --env-file=.env.local scripts/create-admin.mjs <email> "<Nome>" "<palavra-passe>"`.
9. Hospedar a app Next.js com HTTPS (requisito da PWA). O repositório inclui `railway.json` para o
   Railway (projeto `church-comms`): ligar este repositório a um serviço, definir as variáveis do passo 7
   (as `NEXT_PUBLIC_*` são lidas no build) e gerar um domínio. Depois, usar esse domínio em
   `NEXT_PUBLIC_SITE_URL` e nas *Redirect URLs* do Supabase.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção (o Service Worker só regista em produção) |
| `npm run typecheck` | TypeScript |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:db` | Aplica as migrações numa BD descartável e corre os testes de RLS (`PG_ADMIN_URL=...`) |
| `node --env-file=.env.local tests/e2e/fase1.e2e.mjs` | E2E com Playwright contra o Supabase **local** e a app em `:3000` |
| `node scripts/generate-icons.mjs` | Regenera os ícones PWA a partir de `scripts/icon.svg` |

## Estrutura

```
supabase/migrations/     esquema, RLS, funções, canais iniciais, Realtime
supabase/templates/      emails de recuperação e convite
db-tests/                testes SQL de autorização (stub mínimo do Supabase + asserções)
src/proxy.ts             renovação de sessão e redirecionamento para /login
src/lib/                 DAL de autenticação, clientes Supabase, modelo de mensagens
src/components/realtime/ hub único de Realtime (Broadcast, presença, reconexão)
src/app/(auth)/          login e recuperação
src/app/(app)/           painel, canais, perfil e administração
src/domains/             contratos das fases seguintes (alertas, áudio, notificações)
public/sw.js             Service Worker
tests/unit, tests/e2e    testes
```

## Rádio (walkie-talkie)

- Ecrã **Rádio** → escolher o canal → **Ligar rádio** → manter o botão grande carregado para falar.
- Só uma pessoa fala de cada vez por canal. O turno é decidido na base de dados (`request_floor`) e o
  servidor só dá permissão de microfone no LiveKit a quem o tem. O turno expira 30 s depois do último
  sinal do aparelho e nunca dura mais de 2 min seguidos.
- Administradores e responsáveis do canal podem ativar **Falar com prioridade** para interromper um
  membro comum.
- Para ouvir, o ecrã do rádio tem de estar aberto: com o ecrã bloqueado o telemóvel (sobretudo o iPhone)
  pode cortar o áudio de uma PWA.
- Configuração: criar um projeto em https://cloud.livekit.io e definir `LIVEKIT_URL`, `LIVEKIT_API_KEY` e
  `LIVEKIT_API_SECRET` no servidor (Railway → Variables).

## Papéis

- **Administrador**: utilizadores, equipas, canais, membros, configuração e auditoria.
- **Coordenador**: quando é *responsável* de um canal, gere os membros e a apresentação desse canal.
- **Membro**: acesso só aos canais atribuídos.

Todas as permissões são verificadas no servidor e na base de dados (RLS), nunca só no frontend.
