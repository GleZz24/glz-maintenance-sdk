// @glz/maintenance — reporter de errores hacia Bugsink (Sentry-compatible, self-host soberano UE).
// Envoltorio FINO sobre @sentry/browser: misma API pública que el reporter casero, otro transporte.
//
// Uso:
//   import { initMaintenance, MaintenanceBoundary } from '@glz/maintenance'
//   initMaintenance({ app: 'MANDO', dsn: import.meta.env.VITE_SENTRY_DSN })
//   ...envolver <App/> en <MaintenanceBoundary> para cazar la pantalla blanca.

export {
  initMaintenance,
  reportarError,
  esRuidoSW,
  type InitOpts,
  type OpcionesRuido,
} from './core.js'
export { MaintenanceBoundary } from './boundary.js'
