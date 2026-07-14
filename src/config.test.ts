// Tests de resolución de config y gating por entorno (v1.0.0). Runner: node:test vía tsx.
// La cascada (opciones > env > default) es la parte PLUG&PLAY heredada; el DSN sustituye al
// endpoint y NO tiene default (sin DSN → reporter desactivado).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverConfig } from './config.js'

// Aísla la env: limpia las claves que lee resolverConfig, corre el caso y restaura.
const CLAVES = [
  'NEXT_PUBLIC_GLZ_APP', 'GLZ_APP',
  'NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN', 'GLZ_SENTRY_DSN',
  'NEXT_PUBLIC_RELEASE', 'GLZ_RELEASE',
  'NEXT_PUBLIC_GLZ_ENV', 'GLZ_ENV',
  'NEXT_PUBLIC_VERCEL_ENV', 'VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_COMMIT_REF',
  'NODE_ENV',
]
function conEnv(vars: Record<string, string>, fn: () => void): void {
  const previo: Record<string, string | undefined> = {}
  for (const k of CLAVES) {
    previo[k] = process.env[k]
    delete process.env[k]
  }
  Object.assign(process.env, vars)
  try {
    fn()
  } finally {
    for (const k of CLAVES) {
      if (previo[k] === undefined) delete process.env[k]
      else process.env[k] = previo[k]
    }
  }
}

test('app: opción > env > default "desconocida"', () => {
  conEnv({}, () => assert.equal(resolverConfig({ app: 'MANDO', entorno: 'production' }).app, 'MANDO'))
  conEnv({ GLZ_APP: 'DXB' }, () => assert.equal(resolverConfig({ entorno: 'production' }).app, 'DXB'))
  conEnv({ NEXT_PUBLIC_GLZ_APP: 'ANALYTICS' }, () =>
    assert.equal(resolverConfig({ entorno: 'production' }).app, 'ANALYTICS'),
  )
  conEnv({}, () => assert.equal(resolverConfig({ entorno: 'production' }).app, 'desconocida'))
})

test('dsn: opción gana a env; sin nada → undefined (SIN default)', () => {
  conEnv({}, () => assert.equal(resolverConfig({ dsn: 'https://k@bugsink/1', entorno: 'production' }).dsn, 'https://k@bugsink/1'))
  conEnv({}, () => assert.equal(resolverConfig({ entorno: 'production' }).dsn, undefined))
})

test('dsn: se resuelve de NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN / GLZ_SENTRY_DSN', () => {
  conEnv({ NEXT_PUBLIC_SENTRY_DSN: 'https://a@b/1' }, () =>
    assert.equal(resolverConfig({ entorno: 'production' }).dsn, 'https://a@b/1'),
  )
  conEnv({ SENTRY_DSN: 'https://c@d/2' }, () =>
    assert.equal(resolverConfig({ entorno: 'production' }).dsn, 'https://c@d/2'),
  )
  conEnv({ GLZ_SENTRY_DSN: 'https://e@f/3' }, () =>
    assert.equal(resolverConfig({ entorno: 'production' }).dsn, 'https://e@f/3'),
  )
})

test('activo: producción reporta; development y test NO (gating por defecto)', () => {
  conEnv({}, () => {
    assert.equal(resolverConfig({ entorno: 'production' }).activo, true)
    assert.equal(resolverConfig({ entorno: 'preview' }).activo, true)
    assert.equal(resolverConfig({ entorno: 'development' }).activo, false)
    assert.equal(resolverConfig({ entorno: 'test' }).activo, false)
  })
})

test('reportarEnDesarrollo: fuerza activo en development', () => {
  conEnv({}, () => {
    assert.equal(resolverConfig({ entorno: 'development', reportarEnDesarrollo: true }).activo, true)
    // No abre 'test' por accidente si el proyecto no lo pide (sigue el default salvo override).
    assert.equal(resolverConfig({ entorno: 'test', reportarEnDesarrollo: true }).activo, true)
  })
})

test('soloEntornos: allowlist estricta (solo los listados reportan)', () => {
  conEnv({}, () => {
    assert.equal(resolverConfig({ entorno: 'production', soloEntornos: ['production'] }).activo, true)
    assert.equal(resolverConfig({ entorno: 'preview', soloEntornos: ['production'] }).activo, false)
    // La allowlist ignora el default: incluso 'development' reporta si está listado.
    assert.equal(resolverConfig({ entorno: 'development', soloEntornos: ['development'] }).activo, true)
  })
})

test('entorno y release: opción > env > derivado', () => {
  conEnv({ GLZ_ENV: 'staging', GLZ_RELEASE: 'abc123' }, () => {
    const c = resolverConfig()
    assert.equal(c.entorno, 'staging')
    assert.equal(c.release, 'abc123')
  })
  conEnv({ VERCEL_ENV: 'production' }, () =>
    assert.equal(resolverConfig().entorno, 'production'),
  )
  conEnv({ NODE_ENV: 'production' }, () => assert.equal(resolverConfig().entorno, 'production'))
  conEnv({}, () => assert.equal(resolverConfig().entorno, 'development')) // sin pistas
})
