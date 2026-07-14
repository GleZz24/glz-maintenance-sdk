// Tests del filtro de ruido (v1.0.0, forma Sentry). Runner: node:test vía tsx.
//   pnpm test  →  tsx --test src/*.test.ts
//
// Portados 1:1 del test de referencia (web/src/sentry-ruido.test.ts) MÁS los ganchos
// patronesRuido/filtroRuido (aditivos, sobre hint.originalException). esRuidoSW decide por el
// ORIGEN DEL STACK y el mensaje; regla de oro: si el stack toca el bundle propio, NUNCA se filtra.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ErrorEvent, EventHint } from '@sentry/browser'
import { esRuidoSW, crearBeforeSend } from './ruido.js'

// Construye un ErrorEvent mínimo. `mechanism` decide el canal: 'onunhandledrejection' (rechazo de
// promesa, el ÚNICO canal que el casero filtraba), 'onerror' (error síncrono) o 'generic' (boundary
// React / captura manual). Por defecto rechazo, que es donde vive el ruido de MAINT-9O7C.
function evento(
  value: string,
  rutas: string[] = [],
  { type = 'Error', mechanism = 'onunhandledrejection' }: { type?: string; mechanism?: string } = {},
): ErrorEvent {
  return {
    exception: {
      values: [
        {
          type,
          value,
          mechanism: { type: mechanism },
          stacktrace: { frames: rutas.map((abs_path) => ({ abs_path })) },
        },
      ],
    },
  } as unknown as ErrorEvent
}

const hint = (reason: unknown): EventHint => ({ originalException: reason })

// ---- Casos de referencia (paridad estricta con web/src/sentry-ruido.test.ts) ----

test('MAINT-9O7C: rechazo del ciclo de vida del SW se filtra AUNQUE el stack toque nuestro bundle', () => {
  assert.equal(
    esRuidoSW(
      evento('Failed to update a ServiceWorker: network error', [
        'https://maintenance.glzstudio.dev/assets/main-abc.js',
      ]),
    ),
    true,
  )
  assert.equal(
    esRuidoSW(evento('skipWaiting() failed', ['https://maintenance.glzstudio.dev/assets/x.js'])),
    true,
  )
})

test('stack exclusivamente de una extensión del navegador (rechazo) se filtra', () => {
  assert.equal(esRuidoSW(evento('Rejected', ['chrome-extension://abcd/inject.js'])), true)
  assert.equal(
    esRuidoSW(evento('boom', ['moz-extension://abcd/content.js', 'safari-web-extension://ee/x.js'])),
    true,
  )
})

test('stack solo de registro de SW (sin frame propio, rechazo) se filtra', () => {
  assert.equal(esRuidoSW(evento('Rejected', ['https://maintenance.glzstudio.dev/registerSW.js'])), true)
})

test('REGLA DE ORO: un bug real de nuestro bundle NO se filtra', () => {
  assert.equal(
    esRuidoSW(
      evento("Cannot read properties of undefined (reading 'x')", [
        'https://maintenance.glzstudio.dev/assets/App-abc.js',
      ]),
    ),
    false,
  )
})

test('extensión MEZCLADA con nuestro bundle NO se filtra (podría ser un bug real disparado por la ext)', () => {
  assert.equal(
    esRuidoSW(
      evento('boom', ['chrome-extension://abcd/inject.js', 'https://maintenance.glzstudio.dev/assets/App.js']),
    ),
    false,
  )
})

test('PARIDAD: error SÍNCRONO (onerror) con mensaje de SW y stack propio NO se filtra', () => {
  assert.equal(
    esRuidoSW(
      evento('serviceWorker is not defined', ['https://maintenance.glzstudio.dev/assets/App.js'], {
        mechanism: 'onerror',
      }),
    ),
    false,
  )
})

test('PARIDAD: error del ErrorBoundary (generic) con mensaje de SW NO se filtra', () => {
  assert.equal(
    esRuidoSW(
      evento('skipWaiting boom en un componente', ['https://maintenance.glzstudio.dev/assets/App.js'], {
        mechanism: 'generic',
      }),
    ),
    false,
  )
})

test('sin stack (rechazo) no clasificamos por origen → se reporta', () => {
  assert.equal(esRuidoSW(evento('algo raro', [])), false)
})

test('evento vacío/malformado → fail-soft, se reporta', () => {
  assert.equal(esRuidoSW({} as ErrorEvent), false)
  assert.equal(esRuidoSW({ exception: { values: [] } } as unknown as ErrorEvent), false)
})

// ---- Ganchos aditivos del proyecto (patronesRuido / filtroRuido, sobre hint.originalException) ----

test('filtroRuido custom MARCA ruido (aditivo) aunque el stack sea del bundle propio', () => {
  const reason = new Error('ResizeObserver loop limit exceeded')
  const ev = evento('ResizeObserver loop limit exceeded', ['https://maintenance.glzstudio.dev/assets/App.js'])
  // Sin gancho: regla de oro → NO ruido.
  assert.equal(esRuidoSW(ev, hint(reason)), false)
  // Con gancho: el proyecto lo declara ruido (por delante de la regla de oro).
  const filtroRuido = (r: unknown) => r instanceof Error && /ResizeObserver loop/.test(r.message)
  assert.equal(esRuidoSW(ev, hint(reason), { filtroRuido }), true)
})

test('patronesRuido custom (RegExp[]) marca ruido por el mensaje del reason', () => {
  const reason = new Error('Non-Error promise rejection captured with value: undefined')
  const ev = evento('Non-Error promise rejection captured with value: undefined', [
    'https://maintenance.glzstudio.dev/assets/index.js', // frame propio: la regla de oro NO frena a los ganchos
  ])
  assert.equal(esRuidoSW(ev, hint(reason)), false)
  assert.equal(esRuidoSW(ev, hint(reason), { patronesRuido: [/Non-Error promise rejection/] }), true)
})

test('filtroRuido que LANZA no rompe (fail-soft → sigue con el filtro base)', () => {
  const ev = evento('Rejected', ['https://maintenance.glzstudio.dev/registerSW.js']) // solo-SW → base diría true
  const filtroRuido = () => {
    throw new Error('filtro roto')
  }
  assert.equal(esRuidoSW(ev, hint(new Error('Rejected')), { filtroRuido }), true)
})

test('los ganchos SOLO aplican en rechazo: un onerror que casaría el patrón NO se filtra', () => {
  const reason = new Error('ResizeObserver loop')
  const ev = evento('ResizeObserver loop', ['https://maintenance.glzstudio.dev/assets/App.js'], {
    mechanism: 'onerror',
  })
  const filtroRuido = (r: unknown) => r instanceof Error && /ResizeObserver/.test(r.message)
  assert.equal(esRuidoSW(ev, hint(reason), { filtroRuido }), false)
})

// ---- crearBeforeSend: null para ruido, el evento intacto para lo demás ----

test('crearBeforeSend descarta el ruido (null) y deja pasar los bugs reales (event)', () => {
  const beforeSend = crearBeforeSend()
  const ruido = evento('Rejected', ['chrome-extension://abcd/inject.js'])
  const bug = evento("Cannot read 'x'", ['https://maintenance.glzstudio.dev/assets/App.js'])
  assert.equal(beforeSend(ruido), null)
  assert.equal(beforeSend(bug), bug)
})

test('crearBeforeSend respeta los ganchos del proyecto', () => {
  const beforeSend = crearBeforeSend({ patronesRuido: [/Load failed/] })
  const reason = new Error('Load failed')
  const ev = evento('Load failed', ['https://maintenance.glzstudio.dev/assets/App.js'])
  assert.equal(beforeSend(ev, hint(reason)), null)
})
