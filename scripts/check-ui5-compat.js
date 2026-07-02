#!/usr/bin/env node
/**
 * check-ui5-compat.js
 * Verifica la compatibilidad de APIs SAPUI5 usadas en webapp/ contra
 * la versión objetivo definida en package.json → ui5.targetVersion.
 *
 * Uso:
 *   node scripts/check-ui5-compat.js [--version 1.108] [--dir webapp]
 *
 * Exit codes:
 *   0 – Sin incompatibilidades
 *   1 – Se encontraron incompatibilidades o errores de ejecución
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Colores ANSI ────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function error(msg) {
  console.error(`${C.red}${C.bold}[ERROR]${C.reset} ${msg}`);
}
function warn(msg) {
  console.warn(`${C.yellow}${C.bold}[AVISO]${C.reset} ${msg}`);
}
function info(msg) {
  console.log(`${C.cyan}[INFO]${C.reset} ${msg}`);
}
function ok(msg) {
  console.log(`${C.green}${C.bold}[OK]${C.reset} ${msg}`);
}

// ─── Argumnetos CLI ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let cliVersion = null;
let scanDir = "webapp";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--version" && args[i + 1]) cliVersion = args[++i];
  if (args[i] === "--dir" && args[i + 1]) scanDir = args[++i];
}

// ─── Resolución de rutas ─────────────────────────────────────────────────────
const ROOT = process.cwd();
const COMPAT_FILE = path.join(ROOT, "ui5-compatibility.json");
const PKG_FILE = path.join(ROOT, "package.json");
const SCAN_DIR = path.join(ROOT, scanDir);

// ─── Lectura de configuración ────────────────────────────────────────────────
function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    error(`No se encontró ${label}: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    error(`Error al parsear ${label}: ${e.message}`);
    process.exit(1);
  }
}

const compat = readJson(COMPAT_FILE, "ui5-compatibility.json");
const pkg = readJson(PKG_FILE, "package.json");

// ─── Versión objetivo ────────────────────────────────────────────────────────
const targetVersion = cliVersion || (pkg.ui5 && pkg.ui5.targetVersion);

if (!targetVersion) {
  error(
    'No se definió la versión UI5 objetivo.\n' +
    '  → Agrega "ui5": { "targetVersion": "1.108" } en package.json\n' +
    '  → O usa --version 1.108 en la línea de comandos.'
  );
  process.exit(1);
}

info(`Versión UI5 objetivo: ${C.bold}${targetVersion}${C.reset}`);

// ─── Validación de catálogo ──────────────────────────────────────────────────
const catalogEntry = compat.versions[targetVersion];

if (!catalogEntry) {
  const knownVersions = Object.keys(compat.versions).join(", ");
  warn(
    `La versión ${targetVersion} no está en el catálogo local.\n` +
    `  Versiones conocidas: ${knownVersions}\n\n` +
    `  [INCERTIDUMBRE DETECTADA]\n` +
    `  Razón: versión no catalogada en ui5-compatibility.json.\n` +
    `  Última validación del catálogo: ${compat._meta.lastValidated}\n\n` +
    `  ¿Desea consultar la documentación oficial en línea?\n` +
    `  Ejecute 'npm run online-verify' con autorización explícita.`
  );
  process.exit(1);
}

// Advertencia si el catálogo tiene más de 90 días
const lastValidated = new Date(compat._meta.lastValidated);
const daysSince = Math.floor((Date.now() - lastValidated.getTime()) / 86400000);
if (daysSince > 90) {
  warn(
    `El catálogo de compatibilidad tiene ${daysSince} días sin actualizar.\n` +
    `  Última validación: ${compat._meta.lastValidated}\n` +
    `  Considere ejecutar 'npm run online-verify' para validar con datos actualizados.`
  );
}

// ─── Escaneo de archivos ─────────────────────────────────────────────────────
function getAllFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllFiles(SCAN_DIR, [".xml", ".js", ".ts"]);

if (files.length === 0) {
  warn(`No se encontraron archivos en: ${SCAN_DIR}`);
  info("Asegúrese de que existe la carpeta 'webapp/' con archivos .xml, .js o .ts.");
}

// ─── Construcción de patrones de búsqueda ────────────────────────────────────
/**
 * A partir de un nombre de API como "sap.m.Button", genera patrones que
 * detectan su uso en XML (xmlns:m="sap.m" + <m:Button) y en JS/TS
 * (sap.m.Button o "sap/m/Button").
 */
function buildPatterns(apiName) {
  const parts = apiName.split(".");
  const lastPart = parts[parts.length - 1];
  const namespace = parts.slice(0, -1).join(".");
  const amdPath = parts.join("/");

  return [
    // Uso directo en JS: sap.m.Button
    new RegExp(apiName.replace(/\./g, "\\."), "g"),
    // Módulo AMD: "sap/m/Button"
    new RegExp(`["']${amdPath}["']`, "g"),
    // XML: nombre del control sin namespace (puede generar falsos positivos leves)
    new RegExp(`<[A-Za-z]+:${lastPart}[\\s/>]`, "g"),
    // XML namespace: xmlns:x="sap.m"
    new RegExp(`xmlns:[^=]+=["']${namespace.replace(/\./g, "\\.")}["']`, "g"),
  ];
}

// ─── Análisis ─────────────────────────────────────────────────────────────────
const issues = [];

/**
 * Verifica si alguno de los patrones matchea en el contenido del archivo.
 */
function fileContainsApi(content, apiName) {
  const patterns = buildPatterns(apiName);
  return patterns.some((re) => re.test(content));
}

for (const filePath of files) {
  const relPath = path.relative(ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    warn(`No se pudo leer: ${relPath} (${e.message})`);
    continue;
  }

  // Verificar APIs prohibidas
  for (const forbiddenApi of catalogEntry.forbidden) {
    if (fileContainsApi(content, forbiddenApi)) {
      issues.push({
        tipo: "PROHIBIDA",
        archivo: relPath,
        api: forbiddenApi,
        mensaje: `La API '${forbiddenApi}' está prohibida en UI5 ${targetVersion}.`,
        sugerencia: null,
      });
    }
  }

  // Verificar APIs deprecadas
  for (const dep of catalogEntry.deprecated) {
    if (fileContainsApi(content, dep.api)) {
      issues.push({
        tipo: "DEPRECADA",
        archivo: relPath,
        api: dep.api,
        mensaje: `La API '${dep.api}' está deprecada desde UI5 ${dep.since}.`,
        sugerencia: dep.replacement
          ? `Reemplazar por: ${dep.replacement}`
          : "Revisar documentación.",
      });
    }
  }
}

// ─── Reporte de resultados ────────────────────────────────────────────────────
console.log("");
console.log(`${C.bold}=== Resultado de compatibilidad UI5 ${targetVersion} ===${C.reset}`);
console.log(`Archivos analizados: ${files.length}`);
console.log("");

if (issues.length === 0) {
  ok(`No se encontraron incompatibilidades en ${files.length} archivo(s) analizados.`);
  process.exit(0);
}

// Agrupar por tipo
const prohibidas = issues.filter((i) => i.tipo === "PROHIBIDA");
const deprecadas = issues.filter((i) => i.tipo === "DEPRECADA");

if (prohibidas.length > 0) {
  console.log(`${C.red}${C.bold}APIs PROHIBIDAS (${prohibidas.length}):${C.reset}`);
  for (const issue of prohibidas) {
    console.log(`  ${C.red}✖ [${issue.archivo}]${C.reset} ${issue.mensaje}`);
  }
  console.log("");
}

if (deprecadas.length > 0) {
  console.log(`${C.yellow}${C.bold}APIs DEPRECADAS (${deprecadas.length}):${C.reset}`);
  for (const issue of deprecadas) {
    console.log(`  ${C.yellow}⚠ [${issue.archivo}]${C.reset} ${issue.mensaje}`);
    if (issue.sugerencia) {
      console.log(`      → ${issue.sugerencia}`);
    }
  }
  console.log("");
}

error(
  `Se encontraron ${issues.length} incompatibilidad(es).\n` +
  `  Ejecute 'npm run autofix-safe' para intentar correcciones automáticas.`
);

process.exit(1);
