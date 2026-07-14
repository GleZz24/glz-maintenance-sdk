// Tests del servidor (initServidor / reportarErrorServidor / reportarMensajeServidor /
// onRequestError) — v1.0.0, envoltorio sobre @sentry/node. Runner: node:test vía tsx. Sentry se
// MOCKEA con el seam de inyección (no hay envíos reales a Bugsink). Best-effort: nunca lanza.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initServidor,
  reportarErrorServidor,
  reportarMensajeServidor,
  onRequestError,
  __setSentryParaTests,
  __resetParaTests,
} from './server.js'

interface InitOptsSpy {
  dsn?: string
  environment?: string
  enabled?: boolean
  initialScope?: { tags?: { app?: string } }
}
function crearDoble() {
  const initCalls: InitOptsSpy[] = []
  const captureExc: Array<[unknown, { level?: string; extra?: { contexto?: string } } | undefined]> = []
  const captureMsg: Array<[string, { level?: string } | undefined]> = []
  let flushes = 0
  const doble = {
    initCalls,
    captureExc,
    captureMsg,
    get flushes() {
      return flushes
    },
    init(opts: InitOptsSpy) {
      initCalls.push(opts)
      return {} as never
    },
    captureException(err: unknown, hint?: { level?: string; extra?: { contexto?: string } }) {
      captureExc.push([err, hint])
      return 'id'
    },
    captureMessage(msg: string, hint?: { level?: string }) {
      captureMsg.push([msg, hint])
      return 'id'
    },
    async flush(_timeout?: number) {
      flushes++
      return true
    },
  }
  return doble
}

beforeEach(() => __resetParaTests())

test('initServidor sin DSN: NO inicializa', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await initServidor({ app: 'X', entorno: 'production' })
  assert.equal(s.initCalls.length, 0)
})

test('initServidor con DSN: inicializa con opciones correctas', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await initServidor({ app: 'DXB', dsn: 'https://k@bugsink/1', entorno: 'production' })
  assert.equal(s.initCalls.length, 1)
  assert.equal(s.initCalls[0].dsn, 'https://k@bugsink/1')
  assert.equal(s.initCalls[0].environment, 'production')
  assert.equal(s.initCalls[0].enabled, true)
  assert.equal(s.initCalls[0].initialScope?.tags?.app, 'DXB')
})

test('initServidor gating: test → enabled false', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await initServidor({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'test' })
  assert.equal(s.initCalls[0].enabled, false)
})

test('initServidor idempotente: dos llamadas → una init', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await initServidor({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'production' })
  await initServidor({ app: 'X', dsn: 'https://k@bugsink/1', entorno: 'production' })
  assert.equal(s.initCalls.length, 1)
})

test('reportarErrorServidor: captura con nivel y contexto como extra; hace flush', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  const err = new Error('fallo servidor')
  await reportarErrorServidor(err, { nivel: 'warning', contexto: 'envío de email' })
  assert.equal(s.captureExc.length, 1)
  assert.equal(s.captureExc[0][0], err)
  assert.equal(s.captureExc[0][1]?.level, 'warning')
  assert.equal(s.captureExc[0][1]?.extra?.contexto, 'envío de email')
  assert.equal(s.flushes, 1)
})

test('reportarErrorServidor: nivel por defecto "error"', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await reportarErrorServidor(new Error('x'))
  assert.equal(s.captureExc[0][1]?.level, 'error')
})

test('reportarMensajeServidor: captura mensaje con nivel; flush; vacío = no-op', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  await reportarMensajeServidor('cuota casi agotada', { nivel: 'warning' })
  assert.equal(s.captureMsg.length, 1)
  assert.equal(s.captureMsg[0][0], 'cuota casi agotada')
  assert.equal(s.captureMsg[0][1]?.level, 'warning')
  assert.equal(s.flushes, 1)
  await reportarMensajeServidor('')
  assert.equal(s.captureMsg.length, 1) // el vacío no captura
})

test('onRequestError: captura con el path como contexto (extra)', async () => {
  const s = crearDoble()
  __setSentryParaTests(s)
  const err = new Error('petición rota')
  await onRequestError(err, { path: '/api/leads' })
  assert.equal(s.captureExc[0][0], err)
  assert.equal(s.captureExc[0][1]?.extra?.contexto, '/api/leads')
})

test('best-effort: nunca lanza aunque Sentry falle', async () => {
  __setSentryParaTests({
    init() {
      return {} as never
    },
    captureException() {
      throw new Error('sentry roto')
    },
    captureMessage() {
      throw new Error('sentry roto')
    },
    async flush() {
      return true
    },
  })
  await assert.doesNotReject(() => reportarErrorServidor(new Error('x')))
  await assert.doesNotReject(() => reportarMensajeServidor('y'))
})
