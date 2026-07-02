# Comandos del Agente SAPUI5 Offline-First

Este documento describe los comandos disponibles y cómo usarlos.

---

## Resumen de comandos

| Comando npm             | Script equivalente                        | Descripción |
|-------------------------|-------------------------------------------|-------------|
| `npm run analyze`       | `node scripts/check-ui5-compat.js`        | Analiza compatibilidad en modo offline |
| `npm run autofix-safe`  | `node scripts/autofix-safe.js`            | Aplica fixes seguros + genera reporte |
| `npm run verify`        | `lint` + `check-ui5-compat`               | Validación completa offline |
| `npm run online-verify` | Igual que verify + aviso de conexión      | Verificación con autorización online |

---

## `analyze`

**Propósito:** Escanea `webapp/` buscando uso de APIs incompatibles con la versión UI5 objetivo.

**Modo:** OFFLINE (solo datos del catálogo local `ui5-compatibility.json`).

**Uso:**
```bash
npm run analyze
# O directamente:
node scripts/check-ui5-compat.js --version 1.96 --dir webapp
```

**Opciones:**
| Opción | Descripción |
|--------|-------------|
| `--version <ver>` | Sobreescribe la versión definida en `package.json` |
| `--dir <ruta>` | Directorio a escanear (por defecto: `webapp`) |

**Salida esperada:**
- Lista de APIs **prohibidas** encontradas (en rojo).
- Lista de APIs **deprecadas** con sugerencia de reemplazo (en amarillo).
- Exit code `0` si no hay incompatibilidades, `1` si las hay.

**Ejemplo de output con incompatibilidades:**
```
[INFO] Versión UI5 objetivo: 1.108

=== Resultado de compatibilidad UI5 1.108 ===
Archivos analizados: 5

APIs PROHIBIDAS (1):
  ✖ [webapp/view/Main.view.xml] La API 'sap.m.UploadCollection' está prohibida en UI5 1.108.

APIs DEPRECADAS (1):
  ⚠ [webapp/controller/Main.controller.js] La API 'jQuery.sap.log' está deprecada desde UI5 1.58.
      → Reemplazar por: sap.base.Log
```

---

## `autofix-safe`

**Propósito:** Detecta y corrige automáticamente APIs deprecadas con sustituciones seguras 1:1.
Para problemas que no puede corregir automáticamente, genera un reporte en `autofix-report.md`.

**Modo:** OFFLINE. Nunca hace cambios estructurales al código.

**Uso:**
```bash
npm run autofix-safe
# Solo preview de cambios (sin modificar archivos):
npm run autofix-safe:dry
# Solo reporte, sin aplicar cambios:
node scripts/autofix-safe.js --report-only
```

**Fixes automáticos disponibles:**
| API original | Reemplazo seguro |
|--------------|------------------|
| `jQuery.sap.log` | `sap.base.Log` |
| `jQuery.sap.require(` | `sap.ui.require(` |
| `jQuery.sap.declare(` | `sap.ui.define(` |

**Reporte generado:** `autofix-report.md`
- Lista de fixes aplicados.
- Lista de problemas que requieren intervención manual con sugerencias detalladas.

> ⚠️ **Importante:** El autofix solo modifica líneas que coinciden exactamente con el patrón.
> Cambios estructurales (ej: migrar de ODataModel v2 a v4) siempre se reportan como manuales.

---

## `verify`

**Propósito:** Ejecuta lint (ESLint) y verificación de compatibilidad UI5 en secuencia.

**Modo:** OFFLINE.

**Uso:**
```bash
npm run verify
```

**Pasos que ejecuta:**
1. `npm run lint` — ESLint sobre `webapp/`
2. `npm run analyze` — Verificación de compatibilidad

**Cuándo usar:**
- Antes de hacer commit.
- Como paso de CI en ramas de feature.

---

## `online-verify`

**Propósito:** Igual que `verify`, pero con acceso autorizado a internet para contrastar
APIs con la documentación oficial de SAP/OpenUI5.

**Modo:** ONLINE (requiere autorización explícita).

**Uso:**
```bash
npm run online-verify
```

> 🔒 **Política de uso:**
> Este comando debe ejecutarse **únicamente con autorización explícita** del desarrollador.
> Se usa cuando:
> - La versión UI5 objetivo no está en el catálogo local.
> - El catálogo tiene más de 90 días sin actualizar.
> - Existe incertidumbre sobre cambios recientes en la API.
>
> Tras la consulta, el agente citará:
> - URL fuente consultada.
> - Fecha de consulta.
> - Versión de la documentación.

---

## Cambiar la versión UI5 objetivo

Edita `package.json`:

```json
{
  "ui5": {
    "targetVersion": "1.96"
  }
}
```

Versiones disponibles en el catálogo:
- `1.71` — LTS hasta 2021-11-07
- `1.84` — LTS hasta 2023-01-28
- `1.96` — LTS hasta 2023-11-11
- `1.108` — LTS hasta 2024-12-08 (**recomendada por defecto**)

Para agregar una nueva versión, edita `ui5-compatibility.json` siguiendo la estructura existente.

---

## Mensajes del agente

### Incertidumbre detectada
```
[INCERTIDUMBRE DETECTADA]
Razón: La versión X.XX no está en el catálogo local.
Última validación del catálogo: YYYY-MM-DD

¿Desea que consulte la documentación oficial en línea?
Responda "SÍ, consultar online" para autorizar la conexión.
```

### Resultado validado online
```
[VALIDADO ONLINE – 2024-12-01]
Fuente: https://openui5.org/releases/
Versión documentación: 1.120
```
