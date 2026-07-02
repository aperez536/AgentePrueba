# Política de Operación — Agente SAPUI5 Offline-First

## Modo de operación predeterminado: OFFLINE

Este agente opera **exclusivamente en modo offline** por defecto.
Toda validación, sugerencia de fix y análisis de compatibilidad se realiza
contra el conocimiento estático incluido en este repositorio
(`ui5-compatibility.json`, reglas ESLint, scripts de análisis).

---

## Principios fundamentales

### 1. Nunca inventar APIs
El agente **jamás** sugerirá una API que no esté documentada en `ui5-compatibility.json`
o en su base de conocimiento verificada. Ante la duda, emitirá una advertencia explícita
en lugar de proponer código no validado.

### 2. Manejo de incertidumbre por versión o actualización reciente

Cuando el agente detecte alguna de las siguientes condiciones:
- La versión UI5 objetivo no está en `ui5-compatibility.json`.
- Un símbolo o API podría haber cambiado en una versión reciente no catalogada.
- La fecha de última validación del catálogo supera **90 días**.

El agente deberá **seguir este protocolo**:

```
[INCERTIDUMBRE DETECTADA]
Razón: <descripción del motivo>
Última validación del catálogo: <fecha en ui5-compatibility.json>

¿Desea que consulte la documentación oficial en línea para validar este punto?
Responda "SÍ, consultar online" para autorizar la conexión.
Sin autorización, operaré solo con datos locales y marcaré el resultado como PROVISIONAL.
```

### 3. Consulta online (solo con autorización explícita)

- La conexión a internet **solo se activa** cuando el usuario responde afirmativamente.
- Tras obtener información en línea, el agente **siempre cita**:
  - URL fuente
  - Fecha de consulta
  - Versión de la documentación consultada
- El resultado se marca como `[VALIDADO ONLINE – <fecha>]`.

---

## Comandos disponibles

| Comando          | Descripción |
|------------------|-------------|
| `analyze`        | Analiza el proyecto en modo offline y reporta incompatibilidades. |
| `autofix-safe`   | Aplica fixes seguros y no destructivos. Genera reporte si no puede autocorregir. |
| `verify`         | Ejecuta lint + compatibilidad. Solo datos locales. |
| `online-verify`  | Igual que `verify` pero con autorización para consultar internet. |

Ver detalle en [`docs/agent-commands.md`](docs/agent-commands.md).

---

## Estructura del repositorio

```
.
├── AGENTS.md                        ← Este archivo (política de operación)
├── ui5-compatibility.json           ← Catálogo de APIs por versión UI5
├── package.json                     ← Dependencias y scripts npm
├── .eslintrc.json                   ← Reglas ESLint para SAPUI5
├── .prettierrc.json                 ← Configuración Prettier
├── scripts/
│   ├── check-ui5-compat.js          ← Verificador de compatibilidad
│   └── autofix-safe.js              ← Autofixer seguro con reporte
├── docs/
│   └── agent-commands.md            ← Documentación de comandos
├── examples/
│   ├── MainView.view.xml            ← Ejemplo de XML View correcto
│   └── MainController.controller.js ← Ejemplo de Controller correcto
└── .github/
    └── workflows/
        └── validate.yml             ← Pipeline CI de validación
```

---

## Cómo cambiar la versión UI5 objetivo

Edita el campo `"targetVersion"` en `package.json`:

```json
{
  "ui5": {
    "targetVersion": "1.108"
  }
}
```

Las versiones disponibles son las definidas en `ui5-compatibility.json`.
Si especificas una versión no catalogada, el agente emitirá una advertencia de incertidumbre.

---

## Limitaciones actuales

- El catálogo `ui5-compatibility.json` cubre versiones 1.71, 1.84, 1.96 y 1.108.
- El escáner de compatibilidad analiza archivos `.xml`, `.js` y `.ts` dentro de `webapp/`.
- El modo `online-verify` requiere conexión a `openui5.org` / `sapui5.hana.ondemand.com`.
- Los fixes automáticos solo aplican sustituciones seguras 1:1; cambios estructurales
  se reportan como sugerencias sin modificar el código fuente.
