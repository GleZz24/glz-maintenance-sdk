// Tests del cliente (initMaintenance / reportarError) — v1.0.0, envoltorio sobre @sentry/browser.
// Runner: node:test vía tsx. Sentry se MOCKEA con el seam de inyección del módulo (no hay envíos
// reales a Bugsink). Cubre: sin DSN no inicializa, idempotencia, gating por entorno (enabled),
// opciones pasadas a Sentry.init, y el nivel de reportarError.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initMaintenance,
  reportarError,
  __setSentryParaTests,
  __resetParaTests,
} from './core.js'

interface InitOptsSpy {
  dsn?: string
  environment?: string
  release?: string
  enabled?: boolean
  beforeSend?: unknown
  initialScope?: { tags?: { app?: string } }
}
function crearDoble() {
  const initCalls: InitOptsSpy[] = []
  const captureCalls: Array<[unknown, { level?: string } | undefined]> = []
  const doble = {
    initCalls,
    captureCalls,
    init(opts: InitOptsSpy) {
      initCalls.push(opts)
      return {} as never
    },
    captureException(err: unknown, hint?: { level?: string }) {
      captureCalls.push([err, hint])
      return 'evento-id'
    },
  }
  return doble
}

beforeEach(() => __resetParaTests())

test('sin DSN: NO se inicializa Sentry', () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  initMaintenance({ app: 'X', entorno: 'production' }) // sin dsn
  assert.equal(s.initCalls.length, 0)
})

test('con DSN: inicializa Sentry con las opciones correctas', () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  initMaintenance({ app: 'MANDO', dsn: 'https://k@bugsink/1', entorno: 'production', release: 'sha1' })
  assert.equal(s.initCalls.length, 1)
  const o = s.initCalls[0]
  assert.equal(o.dsn, 'https://k@bugsink/1')
  assert.equal(o.environment, 'production')
  assert.equal(o.release, 'sha1')
  assert.equal(o.enabled, true)
  assert.equal(typeof o.beforeSend, 'function')
  assert.equal(o.initialScope?.tags?.app, 'MANDO')
})

test('gating: production → enabled true; test/development → enabled false', () => {
  const prod = crearDoble()
  __setSentryParaTests(prod)
  initMaintenance({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'production' })
  assert.equal(prod.initCalls[0].enabled, true)

  __resetParaTests()
  const tst = crearDoble()
  __setSentryParaTests(tst)
  initMaintenance({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'test' })
  assert.equal(tst.initCalls[0].enabled, false)

  __resetParaTests()
  const dev = crearDoble()
  __setSentryParaTests(dev)
  initMaintenance({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'development' })
  assert.equal(dev.initCalls[0].enabled, false)
})

test('idempotencia: dos llamadas → Sentry.init una sola vez', () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  initMaintenance({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'production' })
  initMaintenance({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'production' })
  assert.equal(s.initCalls.length, 1)
})

test('reportarError: nivel por defecto "error"; ctx.nivel lo sobreescribe', () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  reportarError(new Error('boom'))
  assert.equal(s.captureCalls[0][1]?.level, 'error')
  reportarError(new Error('warn'), { nivel: 'warning' })
  assert.equal(s.captureCalls[1][1]?.level, 'warning')
})

test('reportarError: respeta nivelPorDefecto fijado en initMaintenance', () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  // Sin DSN no inicializa Sentry, pero nivelPorDefecto sí se guarda.
  initMaintenance({ app: 'X', entorno: 'production', nivelPorDefecto: 'warning' })
  reportarError(new Error('algo'))
  assert.equal(s.captureCalls[0][1]?.level, 'warning')
})

test('reportarError: nunca lanza aunque Sentry falle', () => {
  __setSentryParaTests({
    init() {
      return {} as never
    },
    captureException() {
      throw new Error('sentry roto')
    },
  })
  assert.doesNotThrow(() => reportarError(new Error('x')))
})
