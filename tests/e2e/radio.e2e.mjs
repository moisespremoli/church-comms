// Teste ponta-a-ponta do rádio (Push-to-Talk) com áudio real.
// Requer: app em http://localhost:3000 ligada ao Supabase LOCAL e a um projeto
// LiveKit (LIVEKIT_URL/API_KEY/API_SECRET), e uma rede que permita WebRTC.
//   node --env-file=.env.local tests/e2e/radio.e2e.mjs
// NÃO correr contra produção: cria utilizadores.
import { createRequire } from "node:module";
const req = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = createRequire(import.meta.url)("playwright");
const { createClient } = req("@supabase/supabase-js");
const { RoomServiceClient } = req("livekit-server-sdk");
const OUT = process.env.E2E_SCREENSHOTS ?? "/tmp";
const BASE = "http://localhost:3000";
const lk = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^ws/, "http"), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `ptt.${Date.now()}@igreja.test`;
const { data: u } = await sb.auth.admin.createUser({ email, password: "MembroTeste-2026", email_confirm: true, user_metadata: { full_name: "Carla Som" } });
const { data: palco } = await sb.from("channels").select("id").eq("slug", "palco-mesa").single();
await sb.from("channel_members").insert({ channel_id: palco.id, user_id: u.user.id });

let passed = 0;
const ok = (c, d) => { if (!c) throw new Error("FALHOU: " + d); passed++; console.log("  ok -", d); };
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
async function open(email, pw, opts) {
  const ctx = await b.newContext(opts); await ctx.grantPermissions(["microphone"], { origin: BASE });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") console.log("   [console]", m.text().slice(0, 160)); });
  await p.goto(`${BASE}/login`); await p.getByLabel("Email").fill(email); await p.getByLabel("Palavra-passe").fill(pw);
  await p.getByRole("button", { name: "Entrar" }).click(); await p.waitForURL(`${BASE}/`);
  await p.goto(`${BASE}/radio/palco-mesa`); await p.getByRole("button", { name: "Ligar rádio" }).click();
  await p.getByText(/^Ligado ·/).waitFor({ timeout: 30000 });
  return p;
}
try {
  const ana = await open("admin@igreja.test", "AdminTeste-2026", { viewport: { width: 1100, height: 800 } });
  const carla = await open(email, "MembroTeste-2026", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  ok(true, "duas pessoas ligadas ao rádio de PALCO ↔ MESA no LiveKit Cloud");
  await carla.getByText(/2 pessoas a ouvir/).waitFor({ timeout: 15000 });
  ok(true, "cada uma vê a outra na sala");

  const pttAna = ana.getByRole("button", { name: /CARREGUE PARA FALAR/ });
  await pttAna.hover(); await ana.mouse.down();
  await ana.getByText("A TRANSMITIR").waitFor({ timeout: 15000 });
  ok(true, "Ana carrega no botão e fica a transmitir");
  await carla.getByText("Ana Administradora").first().waitFor({ timeout: 15000 });
  ok(await carla.getByText("A falar").isVisible(), "Carla vê 'A falar: Ana Administradora'");
  await carla.waitForFunction(() => {
    const els = [...document.querySelectorAll("[data-radio-audio]")];
    return els.some((el) => el.srcObject && el.srcObject.getAudioTracks().some((t) => t.readyState === "live"));
  }, null, { timeout: 15000 });
  ok(true, "Carla recebe o áudio da Ana (faixa de áudio ao vivo)");
  await carla.waitForTimeout(800);
  await carla.screenshot({ path: `${OUT}/ptt-ouvir.png` });
  await ana.screenshot({ path: `${OUT}/ptt-falar-desktop.png` });

  const parts = await lk.listParticipants(`canal-${palco.id}`);
  const anaP = parts.find((p) => p.name === "Ana Administradora"), carlaP = parts.find((p) => p.name === "Carla Som");
  ok(anaP?.permission?.canPublish === true && carlaP?.permission?.canPublish === false, "no servidor LiveKit só a Ana tem permissão de microfone");

  const pttCarla = carla.getByRole("button", { name: /OCUPADO/ });
  await pttCarla.dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true });
  await carla.getByText(/Canal ocupado: Ana Administradora está a falar/).waitFor({ timeout: 10000 });
  ok(true, "Carla tenta falar e recebe 'Canal ocupado'");
  await pttCarla.dispatchEvent("pointerup", { pointerId: 1, isPrimary: true });

  await ana.mouse.up();
  await carla.getByText("Canal livre").waitFor({ timeout: 15000 });
  ok(true, "Ana larga o botão e o canal fica livre para todos");
  const after = await lk.listParticipants(`canal-${palco.id}`);
  ok(after.find((p) => p.name === "Ana Administradora")?.permission?.canPublish === false, "a permissão de microfone da Ana é retirada ao largar");

  const pttCarla2 = carla.getByRole("button", { name: /CARREGUE PARA FALAR/ });
  await pttCarla2.dispatchEvent("pointerdown", { pointerId: 2, isPrimary: true });
  await carla.getByText("A TRANSMITIR").waitFor({ timeout: 15000 });
  await ana.getByText("Carla Som").first().waitFor({ timeout: 15000 });
  ok(true, "agora a Carla fala e a Ana ouve");
  await carla.waitForTimeout(800);
  await carla.screenshot({ path: `${OUT}/ptt-falar-mobile.png` });

  // Prioridade da coordenação: Ana (admin) interrompe a Carla (membro).
  await ana.getByLabel(/Falar com prioridade/).check();
  await ana.getByRole("button", { name: /OCUPADO/ }).hover(); await ana.mouse.down();
  await ana.getByText("A TRANSMITIR").waitFor({ timeout: 15000 });
  await carla.getByText(/A transmissão foi interrompida/).waitFor({ timeout: 15000 });
  ok(true, "coordenação com prioridade interrompe a Carla e o servidor corta-lhe o microfone");
  await ana.mouse.up();
  console.log(`\n✓ ${passed} verificações do rádio passaram (áudio real via LiveKit Cloud).`);
} catch (e) { console.error(e.message); console.error(`✗ falhou após ${passed}`); process.exitCode = 1; }
finally { await b.close(); }
