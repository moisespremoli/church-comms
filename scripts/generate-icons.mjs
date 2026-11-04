// Gera os ícones PNG da PWA a partir de scripts/icon.svg (usa Playwright/Chromium).
// Uso: node scripts/generate-icons.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// require() respeita NODE_PATH (útil quando o Playwright está instalado globalmente).
const { chromium } = createRequire(import.meta.url)("playwright");

const root = fileURLToPath(new URL("..", import.meta.url));
const svg = await readFile(`${root}scripts/icon.svg`, "utf8");

const targets = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "apple-touch-icon.png", size: 180, padding: 0, square: true },
  // Maskable: conteúdo dentro da "safe zone" (80%) e fundo a toda a área.
  { file: "icon-maskable-512.png", size: 512, padding: 0.1, square: true },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, padding, square } of targets) {
  const inner = Math.round(size * (1 - padding * 2));
  const html = `<html><body style="margin:0;background:${square ? "#070b12" : "transparent"};width:${size}px;height:${size}px;display:grid;place-items:center">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.screenshot({ path: `${root}public/icons/${file}`, omitBackground: !square });
  console.log(`✓ public/icons/${file}`);
}
await browser.close();
