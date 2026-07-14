// Reporter de errores de SERVIDOR (Node) → Bugsink, envoltorio fino sobre @sentry/node.
// No toca window/document: es el complemento del core de navegador. Pensado para
// `instrumentation.ts` (register + onRequestError) y para avisos manuales en server actions,
// rutas y librerías de servidor.
//
// AWAITABLE con flush corto: en funciones serverless conviene `await` para que el evento salga
// antes de que la función se congele; el timeout evita que un backend LENTO alargue la respuesta
// al usuario. Nunca lanza (best-effort).
import * as SentryNode from '@sentry/node';
import { resolverConfig } from './config.js';
const FLUSH_MS = 2000;
let sentry = SentryNode;
/** @internal Solo para tests: sustituye el cliente Sentry real por un doble. */
export function __setSentryParaTests(doble) {
    sentry = doble;
}
/** @internal Solo para tests: restablece el estado del módulo entre casos. */
export function __resetParaTests() {
    sentry = SentryNode;
    iniciado = false;
}
let iniciado = false; // idempotencia
/** Vacía la cola de Sentry con timeout corto. Best-effort: nunca lanza. */
async function vaciar() {
    try {
        await sentry.flush(FLUSH_MS);
    }
    catch {
        /* best-effort: un flush lento/fallido no rompe el flujo de negocio */
    }
}
/**
 * Opcional pero recomendado en `instrumentation.ts` (register): inicializa @sentry/node (→ Bugsink)
 * con dsn/entorno/release de entorno y el tag `app`. Idempotente. Sin DSN no inicializa; el gating
 * por entorno (local/test no reportan) viaja en `enabled`.
 *   dsn: SENTRY_DSN / GLZ_SENTRY_DSN · entorno: GLZ_ENV (o derivado) · release: GLZ_RELEASE · app: GLZ_APP
 */
export async function initServidor(opts) {
    if (iniciado)
        return;
    const cfg = resolverConfig(opts);
    if (!cfg.dsn)
        return; // sin DSN → reporter desactivado
    sentry.init({
        dsn: cfg.dsn,
        environment: cfg.entorno,
        release: cfg.release,
        enabled: cfg.activo && Boolean(cfg.dsn),
        initialScope: { tags: { app: cfg.app } },
    });
    iniciado = true;
}
/** Reporta una excepción de servidor. `contexto` se anexa como dato extra. Nunca lanza. */
export async function reportarErrorServidor(err, ctx) {
    try {
        sentry.captureException(err, {
            level: ctx?.nivel ?? 'error',
            ...(ctx?.contexto ? { extra: { contexto: ctx.contexto } } : {}),
        });
        await vaciar();
    }
    catch {
        /* best-effort */
    }
}
/** Reporta un mensaje (no-excepción) de servidor. Nunca lanza. */
export async function reportarMensajeServidor(mensaje, ctx) {
    if (!mensaje)
        return;
    try {
        sentry.captureMessage(mensaje, { level: ctx?.nivel ?? 'error' });
        await vaciar();
    }
    catch {
        /* best-effort */
    }
}
/**
 * Hook nativo de Next para `instrumentation.ts`:
 *   export { onRequestError } from '@glz/maintenance/server'
 * Next lo invoca ante errores de petición en servidor (nodejs y edge). Anexa el path como contexto.
 */
export async function onRequestError(err, request) {
    await reportarErrorServidor(err, request?.path ? { contexto: request.path } : undefined);
}
