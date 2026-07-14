// Núcleo del reporter de CLIENTE: envoltorio FINO sobre @sentry/browser apuntando a Bugsink.
// Sentry ya trae breadcrumbs (clicks/fetch/console/navigation), dedup y global handlers nativos,
// así que aquí no hay maquinaria casera: solo resolvemos la config plug&play, montamos el filtro
// de ruido (beforeSend) y delegamos. Fire-and-forget: nunca lanza ni bloquea la app que lo usa.

import * as SentryBrowser from '@sentry/browser'
import { resolverConfig, type ConfigOpts } from './config.js'
import { crearBeforeSend, esRuidoSW, type OpcionesRuido } from './ruido.js'

// Reexport del clasificador puro por compatibilidad de API (v0.5.0 lo exportaba).
export { esRuidoSW, type OpcionesRuido }

type Nivel = 'error' | 'warning'

// Subconjunto de @sentry/browser que usamos. Inyectable para los tests (los ES modules
// no permiten reasignar exports nombrados, así que enrutamos por esta variable local).
type ClienteSentry = Pick<typeof SentryBrowser, 'init' | 'captureException'>
let sentry: ClienteSentry = SentryBrowser
/** @internal Solo para tests: sustituye el cliente Sentry real por un doble. */
export function __setSentryParaTests(doble: ClienteSentry): void {
  sentry = doble
}
/** @internal Solo para tests: restablece el estado del módulo entre casos. */
export function __resetParaTests(): void {
  sentry = SentryBrowser
  iniciado = false
  nivelPorDefecto = undefined
}

// Hereda app/dsn/release/entorno/soloEntornos/reportarEnDesarrollo de ConfigOpts.
// En CLIENTE conviene pasar `app`, `entorno` y `dsn` explícitos (Next/Vite solo inyectan
// en el bundle los literales de env, no los accesos dinámicos a process.env).
export interface InitOpts extends ConfigOpts, OpcionesRuido {
  /** Nivel por defecto de los errores reportados a mano sin nivel explícito. */
  nivelPorDefecto?: Nivel
}

let iniciado = false // idempotencia: no re-inicializar Sentry si se llama initMaintenance dos veces
let nivelPorDefecto: Nivel | undefined

/**
 * Arranca el reporter: inicializa @sentry/browser (→ Bugsink) con el entorno, la release, el tag
 * `app` y el filtro de ruido. Idempotente. Sin DSN (ni por opción ni por env) NO inicializa Sentry
 * y el reporter queda desactivado, sin romper nada. El gating por entorno (local/test no reportan)
 * viaja en `enabled`, así que en desarrollo/CI Sentry queda deshabilitado y no envía.
 */
export function initMaintenance(opts: InitOpts = {}): void {
  if (iniciado) return
  const cfg = resolverConfig(opts)
  nivelPorDefecto = opts.nivelPorDefecto
  const dsn = cfg.dsn
  if (!dsn) return // sin DSN → reporter desactivado (no se inicializa Sentry)

  sentry.init({
    dsn,
    environment: cfg.entorno,
    release: cfg.release,
    enabled: cfg.activo && Boolean(dsn),
    beforeSend: crearBeforeSend({ patronesRuido: opts.patronesRuido, filtroRuido: opts.filtroRuido }),
    initialScope: { tags: { app: cfg.app } },
  })
  iniciado = true
}

/**
 * Reporta un error manualmente. Fire-and-forget: nunca lanza ni bloquea la app. Si Sentry no está
 * inicializado (o está deshabilitado por entorno), `captureException` es un no-op nativo de Sentry.
 */
export function reportarError(err: unknown, ctx?: { url?: string; nivel?: Nivel }): void {
  try {
    sentry.captureException(err, {
      level: ctx?.nivel ?? nivelPorDefecto ?? 'error',
      ...(ctx?.url ? { extra: { url: ctx.url } } : {}),
    })
  } catch {
    /* jamás romper la app que nos usa por culpa del reporte */
  }
}
