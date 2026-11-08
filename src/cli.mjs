#!/usr/bin/env node
/* iduframe — HyperFrames + nuestro mod, como paquete propio.
 *
 * Decision de arquitectura: NO fork. El monorepo de HyperFrames son ~24 MB con
 * build propio; un fork obliga a mergear cada release. Aca la dependencia esta
 * FIJADA y lo unico nuestro son tres archivos. Cuando sale una version nueva:
 *   1. subis el pin en package.json
 *   2. corres `iduframe status` -> te dice si el shell cambio
 *   3. si cambio, revisas el diff del shell y actualizas compat/<version>.json
 *
 * El manifiesto de integridad es la parte importante: si upstream toca el shell
 * y nosotros no lo revisamos, `install` falla cerrado en vez de parchear a
 * ciegas. Un parche que se aplica sobre algo que cambio es peor que no aplicar.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCRIPT_NAME = "idu-es.js";
const MARK = "iduframe-es";
const STATIC_PREFIX = "/assets/";
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const studioDir = (pkg) => join(pkg, "dist", "studio");
const shellPath = (pkg) => join(studioDir(pkg), "index.html");
const assetPath = (pkg) => join(studioDir(pkg), "assets", SCRIPT_NAME);

function resolvePkg() {
  const explicit = opt("package");
  if (explicit) return assertPkg(resolve(explicit));

  // 1) nuestra dependencia fija (npm install / global)
  try {
    return assertPkg(dirname(require.resolve("hyperframes/package.json")));
  } catch {}

  // 2) fallback: cache de npx (el caso "ya lo usaba antes")
  const base = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (existsSync(base)) {
    const found = readdirSync(base)
      .map((d) => join(base, d, "node_modules", "hyperframes"))
      .filter((p) => existsSync(shellPath(p)));
    if (found.length) return assertPkg(found[found.length - 1]);
  }
  throw new Error("no encontré hyperframes. Instalá iduframe con npm o pasá --package <ruta>.");
}

function assertPkg(p) {
  if (!existsSync(shellPath(p))) throw new Error(`No parece un paquete hyperframes: ${p}`);
  return p;
}

function versionOf(pkg) {
  return JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
}

function manifestFor(version) {
  const m = join(ROOT, "compat", `${version}.json`);
  return existsSync(m) ? JSON.parse(readFileSync(m, "utf8")) : null;
}

function pristineShell(pkg) {
  const backup = shellPath(pkg) + ".iduframe-backup";
  return existsSync(backup) ? backup : shellPath(pkg);
}

function describe(pkg) {
  const version = versionOf(pkg);
  const html = readFileSync(shellPath(pkg), "utf8");
  return {
    package: pkg,
    version,
    shell: shellPath(pkg),
    shellBytes: statSync(shellPath(pkg)).size,
    installed: html.includes(MARK) && existsSync(assetPath(pkg)),
    upstreamHash: sha(readFileSync(pristineShell(pkg))),
  };
}

function verify(pkg, info) {
  const manifest = manifestFor(info.version);
  if (!manifest) {
    return { ok: false, reason: `sin manifiesto para ${info.version}: revisá el shell y creá compat/${info.version}.json` };
  }
  if (manifest.shell.sha256 !== info.upstreamHash) {
    return {
      ok: false,
      reason:
        `el shell de ${info.version} cambió respecto del manifiesto. ` +
        `esperado ${manifest.shell.sha256.slice(0, 12)}, encontrado ${info.upstreamHash.slice(0, 12)}. ` +
        `Antes de parchear: diff del shell y actualizá compat/${info.version}.json`,
    };
  }
  return { ok: true, manifest };
}

function install(pkg) {
  const info = describe(pkg);
  const check = verify(pkg, info);
  if (!check.ok) throw Object.assign(new Error(check.reason), { code: 3 });

  copyFileSync(join(HERE, SCRIPT_NAME), assetPath(pkg));

  const shell = shellPath(pkg);
  let html = readFileSync(shell, "utf8");
  if (html.includes(MARK)) return { changed: false, ...describe(pkg) };

  const backup = shell + ".iduframe-backup";
  if (!existsSync(backup)) writeFileSync(backup, html, "utf8");

  // La URL lleva el hash del script: sin esto el navegador sirve la version
  // vieja de idu-es.js y una actualizacion del mod no se ve hasta que expire
  // la cache. Con ?v=<hash>, cada build invalida la anterior sola.
  const modHash = sha(readFileSync(join(HERE, SCRIPT_NAME))).slice(0, 8);
  const patched = html.replace(
    /<\/body>/i,
    `  <script data-${MARK} src="${STATIC_PREFIX}${SCRIPT_NAME}?v=${modHash}"></script>\n</body>`
  );
  if (patched === html) throw new Error("no encontré </body> en el shell del studio");
  writeFileSync(shell, patched, "utf8");
  return { changed: true, ...describe(pkg) };
}

function revert(pkg) {
  const info = describe(pkg);
  const shell = shellPath(pkg);
  const before = readFileSync(shell, "utf8");
  const after = before.replace(/\s*<script data-iduframe-es[^>]*><\/script>/i, "");
  if (after !== before) writeFileSync(shell, after, "utf8");

  const dest = assetPath(pkg);
  const had = existsSync(dest);
  if (had) unlinkSync(dest);

  return { changed: after !== before || had, version: info.version };
}

function status(pkg) {
  const words = ["compatible", "sin manifiesto", "shell cambiado"];
  const list = [];

  if (pkg) list.push(describe(pkg));
  else {
    const seen = new Set();
    try {
      const own = dirname(require.resolve("hyperframes/package.json"));
      seen.add(own);
      list.push(describe(own));
    } catch {}
    const base = join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
    if (existsSync(base)) {
      for (const d of readdirSync(base)) {
        const p = join(base, d, "node_modules", "hyperframes");
        if (!existsSync(shellPath(p)) || seen.has(p)) continue;
        seen.add(p);
        list.push(describe(p));
      }
    }
  }

  return list.map((info) => {
    const check = verify({ ...info }, info);
    const state = check.ok ? words[0] : check.reason.includes("manifiesto") ? words[1] : words[2];
    return { ...info, upstream: state, reason: check.ok ? undefined : check.reason };
  });
}

try {
  if (cmd === "status") {
    for (const s of status(opt("package") ? resolvePkg() : undefined)) {
      console.log(
        `${s.installed ? "●" : "○"} ${s.version}  ${s.upstream}${s.reason ? "  — " + s.reason : ""}\n    ${s.package}`
      );
    }
  } else if (cmd === "install") {
    const r = install(resolvePkg());
    console.log(JSON.stringify({ ok: true, changed: r.changed, version: r.version, shell: r.shell }));
  } else if (cmd === "revert") {
    const r = revert(resolvePkg());
    console.log(JSON.stringify({ ok: true, changed: r.changed, version: r.version }));
  } else if (cmd === "measure") {
    const r = spawnSync(process.execPath, [join(HERE, "measure.mjs"), opt("url") || "http://localhost:3002"], {
      stdio: "inherit",
    });
    process.exit(r.status === 0 ? 0 : 1);
  } else if (cmd === "preview") {
    const project = opt("project") || process.cwd();
    const port = opt("port");
    const hf = join(resolvePkg(), "bin", "hyperframes.mjs");
    const args = [hf, "preview", project, ...(port ? ["--port", port] : [])];
    const r = spawnSync(process.execPath, args, { stdio: "inherit" });
    process.exit(r.status === 0 ? 0 : 1);
  } else if (cmd === "render") {
    // Unico camino que produce MP4. El resto del CLI nunca renderiza.
    const project = opt("project") || process.cwd();
    const hf = join(resolvePkg(), "bin", "hyperframes.mjs");
    const r = spawnSync(process.execPath, [hf, "render", project], { stdio: "inherit" });
    process.exit(r.status === 0 ? 0 : 1);
  } else if (cmd === "upstream") {
    // El pin vive en package.json; aca comparamos contra el registry para que
    // "actualizar" sea una decision revisada y no un npm update a ciegas.
    const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const pinned = pkgJson.dependencies.hyperframes;
    // En Windows `npm` es un .cmd: spawn sin shell falla y shell:true dispara
    // DEP0190. Pasar por cmd.exe con argumentos fijos evita las dos cosas.
    const isWin = process.platform === "win32";
    const r = spawnSync(
      isWin ? "cmd.exe" : "npm",
      isWin ? ["/c", "npm", "view", "hyperframes", "version"] : ["view", "hyperframes", "version"],
      { encoding: "utf8" }
    );
    const latest = (r.stdout || "").trim();
    const manifest = manifestFor(pinned);
    console.log(
      JSON.stringify(
        {
          pinned,
          latest: latest || null,
          manifest: manifest ? "presente" : "falta",
          verdict:
            !latest ? "no pude consultar el registry"
              : latest === pinned ? "al dia"
              : "hay una version nueva: revisar el shell antes de subir el pin",
        },
        null,
        2
      )
    );
  } else {
    console.log(
      "uso: iduframe <status|upstream|install|revert|measure|preview|render> [--package <ruta>] [--project <dir>] [--port <n>] [--url <url>]"
    );
    process.exit(2);
  }
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e) }));
  process.exit(e.code === 3 ? 3 : 1);
}
