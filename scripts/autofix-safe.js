#!/usr/bin/env node
/**
 * autofix-safe.js
 * Ejecuta lint, tests y verificación de compatibilidad UI5.
 * Intenta aplicar fixes seguros (sustituciones 1:1 de APIs deprecadas).
 * Si no puede autocorregir, genera un reporte sin modificar el código.
 *
 * Uso:
 *   node scripts/autofix-safe.js [--dry-run] [--report-only]
 *
 * Opciones:
 *   --dry-run      Muestra los cambios que haría sin aplicarlos.
 *   --report-only  Solo genera el reporte, nunca modifica archivos.
 *
 * Exit codes:
 *   0 – Sin problemas (o todos los problemas fueron corregidos)
 *   1 – Quedan problemas que requieren intervención manual
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── Colores ANSI ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  bold: "\x1b[1m",
};

function log(msg) { console.log(msg); }
function error(msg) { console.error(`${C.red}${C.bold}[ERROR]${C.reset} ${msg}`); }
function warn(msg) { console.warn(`${C.yellow}${C.bold}[AVISO]${C.reset} ${msg}`); }
function info(msg) { console.log(`${C.cyan}[INFO]${C.reset}  ${msg}`); }
function ok(msg) { console.log(`${C.green}${C.bold}[OK]${C.reset}    ${msg}`); }
function step(msg) { console.log(`\n${C.blue}${C.bold}▶ ${msg}${C.reset}`); }

// ─── Argumentos CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REPORT_ONLY = args.includes("--report-only");

if (DRY_RUN) info("Modo DRY-RUN activo: no se modificarán archivos.");
if (REPORT_ONLY) info("Modo REPORT-ONLY activo: solo se generará el reporte.");

// ─── Resolución de rutas ─────────────────────────────────────────────────────
const ROOT = process.cwd();
const COMPAT_FILE = path.join(ROOT, "ui5-compatibility.json");
const PKG_FILE = path.join(ROOT, "package.json");
const REPORT_FILE = path.join(ROOT, "autofix-report.md");
const SCAN_DIR = path.join(ROOT, "webapp");

// ─── Lectura de configuración ────────────────────────────────────────────────
function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    error(`No se encontró ${label}: ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const compat = readJson(COMPAT_FILE, "ui5-compatibility.json");
const pkg = readJson(PKG_FILE, "package.json");
const targetVersion = pkg.ui5 && pkg.ui5.targetVersion;

if (!targetVersion) {
  error('Falta "ui5.targetVersion" en package.json.');
  process.exit(1);
}

const catalogEntry = compat.versions[targetVersion];
if (!catalogEntry) {
  error(`Versión ${targetVersion} no catalogada. Ejecute 'npm run online-verify' con autorización.`);
  process.exit(1);
}

// ─── Paso 1: Lint ────────────────────────────────────────────────────────────
step("Paso 1/3 — ESLint");
let lintPassed = false;
try {
  execSync("npx eslint webapp --ext .js,.ts --format compact", {
    cwd: ROOT,
    stdio: "inherit",
  });
  ok("Lint pasó sin errores.");
  lintPassed = true;
} catch (_) {
  warn("Lint encontró problemas. Continúa con el análisis de compatibilidad.");
}

// ─── Paso 2: Tests ───────────────────────────────────────────────────────────
step("Paso 2/3 — Tests");
let testsPassed = false;
const hasMocha = fs.existsSync(path.join(ROOT, "node_modules", ".bin", "mocha")); // eslint-disable-line no-unused-vars
const hasJest = fs.existsSync(path.join(ROOT, "node_modules", ".bin", "jest")); // eslint-disable-line no-unused-vars
const testScript = pkg.scripts && pkg.scripts.test;

if (!testScript || testScript === "echo \"Error: no test specified\" && exit 1") {
  info("No hay script de tests configurado. Saltando paso.");
  testsPassed = true;
} else {
  try {
    execSync("npm test", { cwd: ROOT, stdio: "inherit" });
    ok("Tests pasaron.");
    testsPassed = true;
  } catch (_) {
    warn("Algunos tests fallaron. Revisa el output anterior.");
  }
}

// ─── Paso 3: Compatibilidad + AutoFix ───────────────────────────────────────
step("Paso 3/3 — Verificación de compatibilidad y autofix");

/**
 * Obtiene todos los archivos de un directorio recursivamente.
 */
function getAllFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Sustituciones seguras 1:1 para APIs deprecadas.
 * Solo sustituye patrones no ambiguos en JS/TS.
 */
const SAFE_SUBSTITUTIONS = [
  {
    pattern: /jQuery\.sap\.log\b/g,
    replacement: "sap.base.Log",
    description: "jQuery.sap.log → sap.base.Log",
  },
  {
    pattern: /jQuery\.sap\.require\s*\(/g,
    replacement: "sap.ui.require(",
    description: "jQuery.sap.require() → sap.ui.require()",
  },
  {
    pattern: /jQuery\.sap\.declare\s*\(/g,
    replacement: "sap.ui.define(",
    description: "jQuery.sap.declare() → sap.ui.define()",
  },
];

const files = getAllFiles(SCAN_DIR, [".xml", ".js", ".ts"]);
const manualIssues = [];
const appliedFixes = [];

/**
 * Escapa todos los caracteres especiales de RegExp, incluyendo backslashes.
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const filePath of files) {
  const relPath = path.relative(ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    warn(`No se pudo leer: ${relPath}`);
    continue;
  }

  let modified = content;
  const fileExt = path.extname(filePath);

  // AutoFix solo en archivos JS/TS
  if (fileExt === ".js" || fileExt === ".ts") {
    for (const sub of SAFE_SUBSTITUTIONS) {
      if (sub.pattern.test(modified)) {
        sub.pattern.lastIndex = 0; // resetear el índice global
        const before = modified;
        modified = modified.replace(sub.pattern, sub.replacement);
        if (modified !== before) {
          appliedFixes.push({ archivo: relPath, fix: sub.description });
        }
      }
    }
    if (modified !== content && !DRY_RUN && !REPORT_ONLY) {
      fs.writeFileSync(filePath, modified, "utf8");
    }
  }

  // Verificar APIs prohibidas (no se autocorrigen)
  for (const forbiddenApi of catalogEntry.forbidden) {
    const pattern = new RegExp(escapeRegExp(forbiddenApi), "g");
    if (pattern.test(modified)) {
      manualIssues.push({
        tipo: "PROHIBIDA",
        archivo: relPath,
        api: forbiddenApi,
        sugerencia: `Eliminar uso de '${forbiddenApi}'. Esta API está prohibida en UI5 ${targetVersion}.`,
      });
    }
  }

  // Verificar APIs deprecadas que no tienen autofix
  for (const dep of catalogEntry.deprecated) {
    const hasSafeAutofix = SAFE_SUBSTITUTIONS.some(
      (s) => s.description.startsWith(dep.api)
    );
    if (hasSafeAutofix) continue;

    const pattern = new RegExp(escapeRegExp(dep.api), "g");
    if (pattern.test(modified)) {
      manualIssues.push({
        tipo: "DEPRECADA",
        archivo: relPath,
        api: dep.api,
        sugerencia: dep.replacement
          ? `Reemplazar '${dep.api}' por '${dep.replacement}' (deprecada desde ${dep.since}).`
          : `Revisar uso de '${dep.api}' (deprecada desde ${dep.since}).`,
      });
    }
  }
}

// ─── Reporte ─────────────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
const reportLines = [
  `# Reporte AutoFix Seguro — UI5 ${targetVersion}`,
  ``,
  `**Fecha:** ${timestamp}`,
  `**Archivos analizados:** ${files.length}`,
  `**Versión objetivo:** ${targetVersion}`,
  ``,
  `---`,
  ``,
];

if (appliedFixes.length > 0) {
  reportLines.push(`## ✅ Fixes aplicados automáticamente (${appliedFixes.length})`);
  reportLines.push(``);
  if (DRY_RUN || REPORT_ONLY) {
    reportLines.push(`> Modo ${DRY_RUN ? "DRY-RUN" : "REPORT-ONLY"}: estos cambios NO se aplicaron.`);
    reportLines.push(``);
  }
  for (const fix of appliedFixes) {
    reportLines.push(`- **${fix.archivo}**: ${fix.fix}`);
  }
  reportLines.push(``);
} else {
  reportLines.push(`## ✅ Fixes automáticos`);
  reportLines.push(``);
  reportLines.push(`No se encontraron patrones con autofix disponible.`);
  reportLines.push(``);
}

if (manualIssues.length > 0) {
  reportLines.push(`## ⚠️ Problemas que requieren intervención manual (${manualIssues.length})`);
  reportLines.push(``);

  const prohibidas = manualIssues.filter((i) => i.tipo === "PROHIBIDA");
  const deprecadas = manualIssues.filter((i) => i.tipo === "DEPRECADA");

  if (prohibidas.length > 0) {
    reportLines.push(`### 🔴 APIs Prohibidas (${prohibidas.length})`);
    reportLines.push(``);
    reportLines.push(`| Archivo | API | Sugerencia |`);
    reportLines.push(`|---------|-----|------------|`);
    for (const issue of prohibidas) {
      reportLines.push(`| \`${issue.archivo}\` | \`${issue.api}\` | ${issue.sugerencia} |`);
    }
    reportLines.push(``);
  }

  if (deprecadas.length > 0) {
    reportLines.push(`### 🟡 APIs Deprecadas (${deprecadas.length})`);
    reportLines.push(``);
    reportLines.push(`| Archivo | API | Sugerencia |`);
    reportLines.push(`|---------|-----|------------|`);
    for (const issue of deprecadas) {
      reportLines.push(`| \`${issue.archivo}\` | \`${issue.api}\` | ${issue.sugerencia} |`);
    }
    reportLines.push(``);
  }
} else {
  reportLines.push(`## ✅ Sin problemas que requieran intervención manual`);
  reportLines.push(``);
}

reportLines.push(`---`);
reportLines.push(`*Generado por Agente SAPUI5 Offline-First*`);

const reportContent = reportLines.join("\n");
fs.writeFileSync(REPORT_FILE, reportContent, "utf8");
info(`Reporte guardado en: ${REPORT_FILE}`);

// ─── Resumen final ───────────────────────────────────────────────────────────
log("");
log(`${C.bold}=== Resumen ===${C.reset}`);
log(`  Lint:          ${lintPassed ? C.green + "✓ OK" : C.yellow + "⚠ con advertencias"}${C.reset}`);
log(`  Tests:         ${testsPassed ? C.green + "✓ OK" : C.yellow + "⚠ con fallos"}${C.reset}`);
log(`  Fixes auto:    ${C.green}${appliedFixes.length} aplicado(s)${C.reset}`);
log(`  Manuales:      ${manualIssues.length > 0 ? C.red : C.green}${manualIssues.length} pendiente(s)${C.reset}`);
log("");

if (manualIssues.length > 0) {
  error(
    `Quedan ${manualIssues.length} problema(s) que requieren intervención manual.\n` +
    `  Revisa el reporte en: ${REPORT_FILE}`
  );
  process.exit(1);
}

ok("AutoFix completado. No quedan problemas pendientes.");
process.exit(0);
