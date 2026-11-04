// Teste ponta-a-ponta da Fase 1 contra um Supabase LOCAL (npx supabase start)
// e a aplicação a correr em http://localhost:3000 (npm run build && npm start).
//
//   node --env-file=.env.local tests/e2e/fase1.e2e.mjs
//
// Pré-requisito: administrador criado com scripts/create-admin.mjs usando
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (por omissão admin@igreja.test / AdminTeste-2026).
// NÃO correr contra produção: cria utilizadores, equipas e mensagens.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@igreja.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "AdminTeste-2026",
};
const RUN = Date.now().toString(36);
const BRUNO = { name: `Bruno Segurança ${RUN}`, email: `bruno.${RUN}@igreja.test`, password: "BrunoTeste-2026" };
const CARLA = { name: `Carla Som ${RUN}`, email: `carla.${RUN}@igreja.test`, password: "CarlaTeste-2026" };
const SHOTS = process.env.E2E_SCREENSHOTS;

let passed = 0;
function ok(condition, description) {
  if (!condition) throw new Error(`FALHOU: ${description}`);
  passed++;
  console.log(`  ok - ${description}`);
}

async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function login(page, { email, password }) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`);
}

async function waitConnected(page) {
  await page.getByText("Ligado em tempo real").waitFor({ state: "attached", timeout: 15000 });
}

async function createUser(admin, user, channels) {
  await admin.goto(`${BASE}/admin`);
  const form = admin.locator("form", { has: admin.getByRole("button", { name: "Criar utilizador" }) });
  await form.getByLabel("Nome").fill(user.name);
  await form.getByLabel("Email").fill(user.email);
  await form.getByLabel("Palavra-passe inicial").fill(user.password);
  if (user.team) await form.getByLabel("Equipa").selectOption({ label: user.team });
  for (const channel of channels) await form.getByLabel(channel, { exact: true }).check();
  await form.getByRole("button", { name: "Criar utilizador" }).click();
  await admin.getByText(`Conta criada para ${user.email}`).waitFor();
}

async function send(page, text) {
  await page.getByLabel("Mensagem", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
}

function messageLocator(page, text) {
  return page.getByRole("log").getByText(text, { exact: true });
}

const browser = await chromium.launch();
const desktop = { viewport: { width: 1280, height: 860 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

try {
  // ── Administração ─────────────────────────────────────────────────────────
  console.log("Administração");
  const adminCtx = await browser.newContext(desktop);
  const admin = await adminCtx.newPage();

  await admin.goto(`${BASE}/canais/seguranca`);
  ok(admin.url().startsWith(`${BASE}/login`), "sem sessão, rotas protegidas redirecionam para o login");
  await shot(admin, "desktop-login");

  await admin.getByLabel("Email").fill(ADMIN.email);
  await admin.getByLabel("Palavra-passe").fill("errada-123456");
  await admin.getByRole("button", { name: "Entrar" }).click();
  await admin.getByText("Email ou palavra-passe incorretos.").waitFor();
  ok(true, "credenciais erradas mostram erro genérico");

  await login(admin, ADMIN);
  ok(await admin.getByRole("heading", { name: /Outros canais/ }).isVisible(), "admin vê os canais (acesso de administrador)");

  const team = `Segurança ${RUN}`;
  await admin.goto(`${BASE}/admin/equipas`);
  await admin.getByLabel("Nome").fill(team);
  await admin.getByRole("button", { name: "Criar equipa" }).click();
  await admin.getByText("Equipa criada.").waitFor();
  ok(true, "admin cria equipa");

  await createUser(admin, { ...BRUNO, team }, ["SEGURANÇA", "PALCO ↔ MESA"]);
  ok(true, "admin cria utilizador com equipa e canais (Bruno)");
  await createUser(admin, CARLA, ["PALCO ↔ MESA"]);
  ok(true, "admin cria utilizador só com PALCO ↔ MESA (Carla)");

  await admin.goto(`${BASE}/admin/equipas`);
  const teamCard = admin.getByRole("listitem").filter({ has: admin.getByText(team, { exact: true }) });
  ok(await teamCard.getByText(BRUNO.name).isVisible(), "Bruno aparece na equipa");

  // ── Permissões por canal ─────────────────────────────────────────────────
  console.log("Permissões");
  const brunoCtx = await browser.newContext(desktop);
  const bruno = await brunoCtx.newPage();
  await login(bruno, BRUNO);
  const brunoChannels = await bruno.getByRole("navigation", { name: "Canais" }).getByRole("link").allInnerTexts();
  ok(brunoChannels.length === 2, `Bruno vê exatamente 2 canais (${brunoChannels.join(", ")})`);

  const carlaCtx = await browser.newContext(mobile);
  const carla = await carlaCtx.newPage();
  await login(carla, CARLA);
  await shot(carla, "mobile-painel");
  ok(await carla.getByRole("link", { name: /PALCO ↔ MESA/ }).isVisible(), "Carla vê PALCO ↔ MESA no painel");
  ok(!(await carla.getByRole("link", { name: /SEGURANÇA/ }).count()), "Carla não vê SEGURANÇA");
  const forbidden = await carla.goto(`${BASE}/canais/seguranca`);
  ok(forbidden.status() === 404, "Carla não abre SEGURANÇA por URL (404)");
  await carla.goto(`${BASE}/admin`);
  ok(carla.url().includes("erro=sem-permissao"), "membro não entra na administração");

  // ── Mensagens em tempo real ──────────────────────────────────────────────
  console.log("Tempo real");
  await bruno.goto(`${BASE}/canais/palco-mesa`);
  await carla.goto(`${BASE}/canais/palco-mesa`);
  await Promise.all([waitConnected(bruno), waitConnected(carla)]);

  const first = `ESTÁ TUDO PRONTO ${RUN}`;
  const t0 = Date.now();
  await send(bruno, first);
  await messageLocator(carla, first).waitFor({ timeout: 10000 });
  const latency = Date.now() - t0;
  ok(true, `mensagem chega ao outro dispositivo em tempo real (${latency} ms, inclui UI)`);
  await bruno.getByText("Enviada").last().waitFor();
  ok(true, "autor vê o estado 'Enviada' (confirmado pelo servidor)");

  await carla.reload();
  ok((await messageLocator(carla, first).count()) === 1, "mensagem persiste após recarregar, sem duplicar");
  await shot(carla, "mobile-canal");

  // Não lidas no painel
  await carla.goto(`${BASE}/`);
  await waitConnected(carla);
  const unreadText = `MICROFONE COM PROBLEMA ${RUN}`;
  await send(bruno, unreadText);
  await carla.getByRole("link", { name: /PALCO ↔ MESA.*1 por ler/ }).waitFor({ timeout: 10000 });
  ok(true, "painel mostra 1 mensagem por ler em tempo real");
  const markedRead = carla.waitForResponse((r) => r.url().includes("/rpc/mark_channel_read") && r.ok());
  await carla.getByRole("link", { name: /PALCO ↔ MESA/ }).click();
  await messageLocator(carla, unreadText).waitFor();
  await markedRead;
  await carla.goto(`${BASE}/`);
  await carla.waitForTimeout(500);
  ok(!(await carla.getByRole("link", { name: /PALCO ↔ MESA.*por ler/ }).count()), "abrir o canal marca como lido");

  // ── Reconexão e sincronização ────────────────────────────────────────────
  console.log("Reconexão");
  await carla.goto(`${BASE}/canais/palco-mesa`);
  await waitConnected(carla);
  await carlaCtx.setOffline(true);
  await carla.getByText(/Sem ligação à internet/).waitFor({ timeout: 10000 });
  ok(true, "perda de rede é indicada ao utilizador");
  const missedA = `AUMENTAR MONITOR ${RUN}`;
  const missedB = `2 MINUTOS PARA COMEÇAR ${RUN}`;
  await send(bruno, missedA);
  await send(bruno, missedB);
  await bruno.getByText("Enviada").last().waitFor();
  await carla.waitForTimeout(1500);
  await carlaCtx.setOffline(false);
  await messageLocator(carla, missedB).waitFor({ timeout: 20000 });
  await carla.waitForTimeout(1500);
  ok((await messageLocator(carla, missedA).count()) === 1, "mensagem perdida offline sincroniza uma única vez (A)");
  ok((await messageLocator(carla, missedB).count()) === 1, "mensagem perdida offline sincroniza uma única vez (B)");

  // Envio sem rede: falha visível, reenvio automático com o mesmo client_id.
  await carlaCtx.setOffline(true);
  const offlineMsg = `ENVIADA SEM REDE ${RUN}`;
  await send(carla, offlineMsg);
  await carla.getByText(/Não enviada/).waitFor({ timeout: 15000 });
  ok(true, "envio sem rede fica marcado como 'Não enviada'");
  await shot(carla, "mobile-offline");
  await carlaCtx.setOffline(false);
  await messageLocator(bruno, offlineMsg).waitFor({ timeout: 20000 });
  await bruno.waitForTimeout(1500);
  ok((await messageLocator(bruno, offlineMsg).count()) === 1, "reenvio automático ao reconectar, sem duplicar");
  await carla.reload();
  ok((await messageLocator(carla, offlineMsg).count()) === 1, "no servidor existe uma única cópia");

  // Pesquisa no histórico
  await bruno.getByRole("button", { name: "Pesquisar no histórico" }).click();
  await bruno.getByLabel("Pesquisar mensagens").fill("monitor");
  await bruno.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await bruno.getByRole("search").locator("..").getByText(missedA).waitFor();
  ok(true, "pesquisa no histórico encontra mensagens (português, sem acentos/maiúsculas)");
  await bruno.getByRole("button", { name: "Fechar pesquisa" }).click();
  await shot(bruno, "desktop-canal");

  // ── Recuperação de palavra-passe ─────────────────────────────────────────
  console.log("Recuperação de palavra-passe");
  const recoverCtx = await browser.newContext(desktop);
  const recover = await recoverCtx.newPage();
  await recover.goto(`${BASE}/recuperar`);
  await recover.getByLabel("Email").fill(CARLA.email);
  await recover.getByRole("button", { name: "Enviar ligação" }).click();
  await recover.getByText(/Se existir uma conta/).waitFor();
  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${CARLA.email}`)}`);
    const list = await res.json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      link = msg.HTML?.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1]?.replaceAll("&amp;", "&") ?? null;
    }
    if (!link) await new Promise((r) => setTimeout(r, 500));
  }
  ok(Boolean(link), "email de recuperação recebido com ligação token_hash");
  await recover.goto(link);
  await recover.waitForURL(`${BASE}/nova-palavra-passe`);
  const newPassword = "CarlaNova-2026!";
  await recover.getByLabel("Nova palavra-passe").fill(newPassword);
  await recover.getByLabel("Confirmar palavra-passe").fill(newPassword);
  await recover.getByRole("button", { name: "Alterar palavra-passe" }).click();
  await recover.waitForURL(/\/login\?estado=palavra-passe-alterada/);
  await login(recover, { email: CARLA.email, password: newPassword });
  ok(true, "nova palavra-passe funciona");
  await recoverCtx.close();

  // ── Desativação ──────────────────────────────────────────────────────────
  console.log("Desativação");
  await admin.goto(`${BASE}/admin`);
  const carlaRow = admin.getByRole("listitem").filter({ hasText: CARLA.email });
  await carlaRow.getByRole("button", { name: "Desativar" }).click();
  await carlaRow.getByText("Desativado").waitFor();
  await shot(admin, "desktop-admin");
  await carla.goto(`${BASE}/canais/palco-mesa`);
  ok(carla.url().includes("/login"), "utilizador desativado perde o acesso");

  const auditCtx = await admin.goto(`${BASE}/admin/auditoria`);
  ok(auditCtx.ok() && (await admin.getByText("Alterou perfil").count()) > 0, "auditoria regista a desativação");

  await admin.goto(`${BASE}/`);
  await shot(admin, "desktop-painel");

  console.log(`\n✓ ${passed} verificações E2E passaram.`);
} catch (error) {
  console.error(error);
  console.error(`\n✗ Falhou após ${passed} verificações.`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
