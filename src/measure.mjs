#!/usr/bin/env node
/* iduframe measure — cuánto del Studio está en español, con datos.
 *
 * Corre el Studio real en Chrome headless, camina el DOM visible y clasifica
 * cada string contra el diccionario que el propio mod expone en
 * window.__IDUFRAME_ES__. No duplica el diccionario: si no está instalado,
 * falla con un mensaje claro.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const url = process.argv[2] || "http://localhost:3002";

function resolvePlaywright() {
  const base = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    const p = join(base, d, "node_modules", "playwright", "index.mjs");
    if (existsSync(p)) return p;
  }
  return null;
}

const pwPath = resolvePlaywright();
if (!pwPath) {
  console.error("no encontré playwright en el cache de npx");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(pwPath).href);

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find(existsSync);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--hide-scrollbars"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// Medir sobre la UI en INGLES: si la pagina ya esta traducida, comparar contra
// las claves inglesas da 2% y no dice nada. El mod respeta este flag.
await page.addInitScript(() => localStorage.setItem("iduframe-lang", "en"));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const result = await page.evaluate(() => {
  const mod = window.__IDUFRAME_ES__;
  if (!mod) return { error: "mod no instalado (window.__IDUFRAME_ES__ ausente)" };

  const { dict, patterns } = mod;
  const covered = (t) => dict[t] !== undefined || patterns.some((p) => new RegExp(p[0]).test(t));
  // Lo que no es idioma no entra en el denominador: relojes, numeros, ids de
  // composicion y el marcador "fx" de la pista.
  const NOT_TEXT = /^(\d{2}:\d{2}(:\d{2})?|\d+(\.\d+)?x|\d+%|\d+|fx|×\d+)$/i;
  const isIdentifier = (t) => /^[a-z0-9._-]+$/i.test(t) && !/\s/.test(t) && t.length > 2;
  // Nombres de pistas y elementos de LA COMPOSICION del usuario, no del Studio:
  // "E01 Kicker", "World, 0.0 to 185.0 seconds". Se excluyen por contenedor.
  const isUserContent = (el) =>
    !!el.closest('[role="treegrid"],[aria-label*="track" i],[aria-label*="Timeline" i]');

  const seen = new Map();
  const walk = (node) => {
    if (node.nodeType === 3) {
      const el = node.parentElement;
      if (el && isUserContent(el)) return;
      const t = node.nodeValue.trim();
      if (t.length > 1 && !NOT_TEXT.test(t)) seen.set(t, (seen.get(t) || 0) + 1);
      return;
    }
    if (node.nodeType !== 1) return;
    if (["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "IFRAME"].includes(node.tagName)) return;
    if (isUserContent(node)) return;
    for (const attr of ["aria-label", "title", "placeholder"]) {
      const v = node.getAttribute(attr);
      if (v && v.trim().length > 1 && !NOT_TEXT.test(v.trim())) seen.set(v.trim(), (seen.get(v.trim()) || 0) + 1);
    }
    for (const c of node.childNodes) walk(c);
  };
  walk(document.body);

  const all = [...seen.keys()].filter((t) => !isIdentifier(t));
  const missing = all.filter((t) => !covered(t));
  const totalWeight = all.reduce((a, t) => a + seen.get(t), 0);
  const missingWeight = missing.reduce((a, t) => a + seen.get(t), 0);

  return {
    unique: all.length,
    uniqueCovered: all.length - missing.length,
    occurrences: totalWeight,
    occurrencesCovered: totalWeight - missingWeight,
    missing: missing.sort((a, b) => seen.get(b) - seen.get(a)).slice(0, 25),
  };
});

await browser.close();

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
console.log(`\n  cobertura por string único : ${result.uniqueCovered}/${result.unique} (${pct(result.uniqueCovered, result.unique)}%)`);
console.log(`  cobertura por aparición    : ${result.occurrencesCovered}/${result.occurrences} (${pct(result.occurrencesCovered, result.occurrences)}%)\n`);
if (result.missing.length) {
  console.log("  faltan (top 25 por frecuencia):");
  for (const m of result.missing) console.log(`    · ${m.slice(0, 90)}`);
}
