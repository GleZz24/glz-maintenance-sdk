// Filtro de ruido para Sentry — replica `esRuidoSW` del reporter casero (@glz/maintenance v0.5.0),
// que fue lo que resolvió MAINT-9O7C. Los rechazos del ciclo de vida del Service Worker y los
// errores de extensiones del navegador NO son bugs de la app y no deben llegar a Bugsink.
//
// Función PURA: solo importa TIPOS de Sentry (no arrastra runtime), así que se testea aislada.
// Se conecta en `Sentry.init({ beforeSend })` vía `crearBeforeSend`.
//
// PARIDAD CON EL CASERO: el filtro casero corría SOLO en `unhandledrejection`; el error síncrono
// (window.onerror) y el aviso manual/ErrorBoundary NO se filtraban nunca (README del SDK v0.5.0).
// Aquí `beforeSend` es un único punto para los tres canales, así que restringimos TODO el filtro a
// los rechazos de promesa (mechanism `onunhandledrejection`). Sin esto, un bug REAL síncrono o del
// ErrorBoundary cuyo mensaje mencione 'serviceWorker' se descartaría — justo lo que no queremos.
//
// Reglas (idénticas al casero, mismo orden), SOLO sobre rechazos:
//   1) GANCHOS `filtroRuido`/`patronesRuido` (aditivos, del proyecto): se prueban contra
//      `hint.originalException` (el reason). Si marcan ruido → descarta, ANTES de la regla de oro.
//   2) PATRÓN SW del mensaje (aditivo, ANTES de la regla de oro): si el mensaje cita el ciclo de
//      vida del SW → ruido, AUNQUE el stack toque nuestro bundle. Esa era la causa de MAINT-9O7C:
//      reg.update() rechaza, el stack incluye /assets/main.tsx y la regla de oro lo dejaba pasar.
//   3) REGLA DE ORO: si el stack contiene ≥1 frame de NUESTRO bundle (/assets/, /chunks/, /_next/) → NO ruido.
//   4) Stack EXCLUSIVAMENTE de esquema de extensión o de registro de SW → ruido.
//   5) Fail-soft: ante cualquier duda o excepción → NO ruido (se reporta; nunca tragarse un bug real).

import type { ErrorEvent, EventHint } from '@sentry/browser'

const RE_SW_MSG =
  /serviceWorker|ServiceWorkerRegistration|Failed to (update|register) a ServiceWorker|skipWaiting|clients\.claim/i
const RE_EXT = /^(chrome-extension|moz-extension|safari-web-extension):\/\//
const RE_SW_FRAME =
  /registerSW\.js|serviceWorker\.register|navigator\.serviceWorker|ServiceWorkerRegistration/i
const RE_PROPIO = /\/assets\/|\/chunks\/|\/_next\//

/** Ganchos del clasificador de ruido, extensibles por proyecto sin tocar el SDK. */
export interface OpcionesRuido {
  /**
   * Patrones extra para clasificar un rechazo como RUIDO. Se prueban contra el mensaje + stack
   * del `reason` (`hint.originalException`). ADITIVOS al filtro base (amplían, no sustituyen).
   * Ej: `patronesRuido: [/ResizeObserver loop/, /Non-Error promise rejection/]`.
   */
  patronesRuido?: RegExp[]
  /**
   * Gancho para clasificar un rechazo como RUIDO. Recibe el `reason` (`hint.originalException`) y
   * devuelve `true` para descartar. ADITIVO al filtro base. Fail-soft: si lanza, se ignora.
   * Ej: `filtroRuido: (r) => r instanceof Error && /Load failed/.test(r.message)`.
   */
  filtroRuido?: (reason: unknown) => boolean
}

/**
 * ¿Es este evento RUIDO conocido (registro de SW / extensión) y debe descartarse antes de Bugsink?
 * Decide por el ORIGEN DEL STACK y el mensaje, nunca por palabras sueltas fuera de contexto.
 * Pura y a prueba de fallos: ante cualquier excepción devuelve `false` (fail-soft: preferimos
 * reportar de más antes que tragarnos un error real). `hint` aporta el `originalException` (reason)
 * sobre el que operan los ganchos del proyecto; `opts` son esos ganchos.
 */
export function esRuidoSW(event: ErrorEvent, hint?: EventHint, opts?: OpcionesRuido): boolean {
  try {
    const values = event?.exception?.values ?? []

    // Solo los rechazos de promesa entran al filtro (paridad con el casero); el resto se reporta.
    const esRechazo = values.some((v) => v?.mechanism?.type === 'onunhandledrejection')
    if (!esRechazo) return false

    // (1) Ganchos del proyecto (aditivos), por delante de la regla de oro. Fail-soft por separado.
    const reason = hint?.originalException
    if (opts?.filtroRuido) {
      try {
        if (opts.filtroRuido(reason) === true) return true
      } catch {
        /* gancho roto: ignorar y seguir con el filtro base */
      }
    }
    if (opts?.patronesRuido && opts.patronesRuido.length > 0) {
      const texto = textoDeReason(reason)
      for (const re of opts.patronesRuido) {
        try {
          if (re.test(texto)) return true
        } catch {
          /* regexp problemática: ignorar */
        }
      }
    }

    const mensaje =
      values.map((v) => `${v?.type ?? ''}: ${v?.value ?? ''}`).join(' ') + ' ' + (event?.message ?? '')

    // (2) Patrón SW del mensaje: aditivo y por delante de la regla de oro (causa raíz de MAINT-9O7C).
    if (RE_SW_MSG.test(mensaje)) return true

    const rutas = values
      .flatMap((v) => v?.stacktrace?.frames ?? [])
      .map((f) => f.abs_path || f.filename || '')
      .filter(Boolean)

    if (rutas.length === 0) return false // sin stack no clasificamos por origen → se reporta
    if (rutas.some((r) => RE_PROPIO.test(r))) return false // (3) regla de oro
    if (rutas.every((r) => RE_EXT.test(r) || RE_SW_FRAME.test(r))) return true // (4) solo ext/SW
    return false
  } catch {
    return false // (5) fail-soft
  }
}

/** Texto (mensaje + stack) del reason sobre el que prueban los `patronesRuido` del proyecto. */
function textoDeReason(reason: unknown): string {
  try {
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : reason == null
            ? ''
            : JSON.stringify(reason)
    const stack = reason instanceof Error && reason.stack ? reason.stack : ''
    return stack ? msg + '\n' + stack : msg
  } catch {
    return ''
  }
}

/**
 * Fabrica el `beforeSend` de Sentry a partir de los ganchos del proyecto. Descarta (devuelve
 * `null`) los eventos que `esRuidoSW` marca como ruido; el resto pasan intactos. Nunca lanza.
 */
export function crearBeforeSend(
  opts?: OpcionesRuido,
): (event: ErrorEvent, hint?: EventHint) => ErrorEvent | null {
  return (event: ErrorEvent, hint?: EventHint): ErrorEvent | null =>
    esRuidoSW(event, hint, opts) ? null : event
}
