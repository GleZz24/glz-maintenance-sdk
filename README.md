# @glz/maintenance

Reporter de errores de las apps GLZ. Desde **v1.0.0** es un **envoltorio fino sobre Sentry**
(`@sentry/browser` en cliente, `@sentry/node` en servidor) apuntando a **Bugsink** —un backend
Sentry-compatible **self-host y soberano (UE)**—. La **API pública no cambia**: las apps que ya lo
usan solo tienen que **subir la versión y darle un DSN**; su código de integración sigue igual.

> Antes reportábamos a un motor casero (`POST /api/error`). Ahora el transporte es Sentry→Bugsink,
> con breadcrumbs (clicks/fetch/console/navigation), deduplicación y global handlers **nativos**.
> El DSN es público (modelo Sentry): no lleva secretos.

## Instalar (git-install)

```bash
pnpm add github:GleZz24/glz-maintenance-sdk
```

Se instalan también `@sentry/browser` y `@sentry/node` como dependencias. `react` es peer
**opcional** (solo la usa el `MaintenanceBoundary`).

## Configuración por entorno

- **DSN** — a dónde reporta. Sin DSN, el reporter queda **desactivado** (no inicializa Sentry) y
  no rompe nada.
  - Cliente: `NEXT_PUBLIC_SENTRY_DSN` (o pásalo en `initMaintenance({ dsn })`).
  - Servidor: `SENTRY_DSN` / `GLZ_SENTRY_DSN`.
- `NEXT_PUBLIC_GLZ_APP` (cliente) / `GLZ_APP` (servidor) — nombre de la app (tag `app` en Bugsink).
- `NEXT_PUBLIC_RELEASE` / `GLZ_RELEASE` — opcional, SHA/versión del deploy (des-minifica stacks con source maps).
- `NEXT_PUBLIC_GLZ_ENV` / `GLZ_ENV` — opcional, etiqueta del entorno (production/preview/dev…).
  Si no se fija, se autodetecta (ver más abajo).

> **Matiz del cliente:** Next/Vite solo inyectan en el bundle de navegador los **literales**
> (`process.env.NEXT_PUBLIC_*`, `import.meta.env.VITE_*`), no los accesos dinámicos. Por eso en el
> **cliente** se pasan `dsn`, `app` y `entorno` explícitos a `initMaintenance`. En **servidor** todo
> se resuelve de entorno sin tocar nada.

## Conciencia de entorno (agnóstico del host)

Cada evento lleva su `environment` para que Bugsink separe producción de dev/preview. No asume Vercel:

- **Fijar explícito (vale en cualquier host):** `GLZ_ENV` en servidor, o `entorno` en
  `initMaintenance({ entorno })` en cliente. Manda sobre todo lo demás.
- **Autodetección de cortesía** si no se fija nada:
  1. Vercel: `production` directo; si no, la rama de git (`VERCEL_GIT_COMMIT_REF`) separa dev/preview.
  2. Genérico (Docker, VPS, Railway, Render, Fly, local…): `NODE_ENV`.
  3. Sin pistas → `development`.

Gating: por defecto **`development` (local) y `test` (CI) NO reportan** (viaja en `enabled: false`
de Sentry, así que ni siquiera se envía). Para afinar: `initMaintenance({ soloEntornos: ['production'] })`
(allowlist estricta) o `{ reportarEnDesarrollo: true }` (incluir local). Aplica igual en `initServidor`.

## Enchufar un proyecto (plug&play)

Tres ficheros, una línea cada uno, más las envs. El reporter de servidor ya vive en el SDK.

**`instrumentation-client.ts`** (Next) o tu entry de navegador (Vite) — errores de cliente:

```ts
import { initMaintenance } from '@glz/maintenance'

// Next: dsn: process.env.NEXT_PUBLIC_SENTRY_DSN
initMaintenance({ app: 'DXB', dsn: import.meta.env.VITE_SENTRY_DSN })
// Sentry engancha window.error + unhandledrejection + breadcrumbs; el filtro de ruido va montado.
```

**`instrumentation.ts`** — errores de servidor (Node/edge):

```ts
import { initServidor } from '@glz/maintenance/server'

export async function register() {
  await initServidor() // dsn/entorno/release de env
}

export { onRequestError } from '@glz/maintenance/server' // errores de petición del servidor
```

**(Opcional, React)** envuelve tu app para cazar la pantalla blanca:

```tsx
import { MaintenanceBoundary } from '@glz/maintenance'

<MaintenanceBoundary><App /></MaintenanceBoundary>
```

## Filtro de ruido del Service Worker / extensiones (cliente)

El `unhandledrejection` recibe rechazos que **no son bugs de la app**: una extensión del navegador
(p.ej. una que envuelve `navigator.serviceWorker.register`) puede rechazar con `"Rejected"` y, sin
filtro, eso llegaría a Bugsink como un error. El SDK monta un `beforeSend` que descarta ese ruido
**por el ORIGEN del stack y el mensaje** (no por palabras sueltas), con **paridad estricta** con el
filtro que resolvió MAINT-9O7C. Solo actúa sobre `unhandledrejection`; el error síncrono y el del
`MaintenanceBoundary` **nunca** se filtran.

- Se descarta un rechazo si el stack es **exclusivamente** frames de registro de SW (`registerSW.js`,
  `serviceWorker.register`, `navigator.serviceWorker`, `ServiceWorkerRegistration`) o de esquema de
  extensión (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`); o si el mensaje
  cita el ciclo de vida del SW (causa raíz de MAINT-9O7C).
- **Regla de oro:** si el stack contiene **al menos un frame del bundle propio** (`/_next/`,
  `/assets/`, `/chunks/`), **NO se filtra** — así no se tragan bugs reales, incluidos los del SW de la app.
- Fail-soft: ante cualquier duda o excepción, **se reporta**.

### Extender el filtro sin tocar el SDK

```ts
initMaintenance({
  app: 'DXB',
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // Patrones extra (se prueban contra mensaje + stack del reason):
  patronesRuido: [/ResizeObserver loop/, /Non-Error promise rejection/],
  // o un gancho a medida (true = descartar):
  filtroRuido: (r) => r instanceof Error && /Load failed/.test(r.message),
})
```

`patronesRuido` y `filtroRuido` son **aditivos** al filtro base (si cualquiera marca ruido, se
descarta), operan sobre `hint.originalException` (el reason) y solo aplican en `unhandledrejection`.
La función pura `esRuidoSW(event, hint?, opts?)` se exporta por si un proyecto quiere clasificar por
su cuenta.

## Avisos manuales

```ts
// Cliente
import { reportarError } from '@glz/maintenance'
reportarError(new Error('algo raro'), { nivel: 'warning' })

// Servidor (server actions, rutas, librerías de servidor)
import { reportarErrorServidor, reportarMensajeServidor } from '@glz/maintenance/server'
await reportarErrorServidor(err, { nivel: 'warning', contexto: 'envío de email' })
await reportarMensajeServidor('cuota de API casi agotada', { nivel: 'warning' })
```

## API

- **`@glz/maintenance`** (cliente): `initMaintenance(opts?)`, `reportarError(err, ctx?)`, `esRuidoSW(event, hint?, opts?)`, `MaintenanceBoundary`.
- **`@glz/maintenance/server`** (Node/edge): `initServidor(opts?)`, `reportarErrorServidor(err, ctx?)`, `reportarMensajeServidor(mensaje, ctx?)`, `onRequestError`.

Las `opts` (`{ app?, dsn?, release?, entorno?, soloEntornos?, reportarEnDesarrollo? }`) siempre ganan
al entorno. `initMaintenance` acepta además `nivelPorDefecto`, `patronesRuido` y `filtroRuido`.

## `/api/health` profundo (`@glz/maintenance/salud`)

Un GET a la raíz miente: Vercel sirve el HTML aunque Supabase esté caído. Expón un `/api/health` que
compruebe las dependencias reales y devuelva **503** si algo falla, y apunta ahí la sonda de uptime.

```ts
// app/api/health/route.ts
import { respuestaSalud } from '@glz/maintenance/salud'
export const dynamic = 'force-dynamic'

export async function GET() {
  return respuestaSalud({
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    checks: {
      supabase: async () => {
        const { error } = await supabase.from('contactos').select('id').limit(1)
        return !error
      },
      env: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
  })
}
```

200 = sano · 503 = alguna dependencia caída (la sonda lo trata como caído). Las comprobaciones corren
en paralelo con timeout (una que cuelga = fallo, no cuelga el endpoint). Este módulo es ajeno a Sentry.

## Notas

- El DSN es público (modelo Sentry): no lleva secretos.
- Cliente: fire-and-forget (Sentry gestiona dedup y breadcrumbs). Servidor: awaitable con
  `Sentry.flush(2 s)` corto (en serverless conviene `await` para que el evento salga antes de congelarse la función).
- Nunca lanza ni bloquea tu app. Sin DSN (o en local/CI) queda desactivado silenciosamente.
- React es peer dependency **opcional**: sin React, usa solo las funciones de captura.
- `dist/` se versiona (git-install lo usa directamente). Tras cambiar `src/`, ejecuta `pnpm build` y commitea `dist/`.
- Tests con el runner nativo de Node vía `tsx`: `pnpm test` (`tsx --test src/*.test.ts`). Los
  `*.test.ts` se excluyen del build (no entran en `dist/`). El filtro de ruido se mockea; no hay envíos reales a Bugsink en los tests.
