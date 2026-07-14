import * as SentryNode from '@sentry/node';
import { type ConfigOpts } from './config.js';
type Nivel = 'error' | 'warning';
type ClienteSentry = Pick<typeof SentryNode, 'init' | 'captureException' | 'captureMessage' | 'flush'>;
/** @internal Solo para tests: sustituye el cliente Sentry real por un doble. */
export declare function __setSentryParaTests(doble: ClienteSentry): void;
/** @internal Solo para tests: restablece el estado del módulo entre casos. */
export declare function __resetParaTests(): void;
/**
 * Opcional pero recomendado en `instrumentation.ts` (register): inicializa @sentry/node (→ Bugsink)
 * con dsn/entorno/release de entorno y el tag `app`. Idempotente. Sin DSN no inicializa; el gating
 * por entorno (local/test no reportan) viaja en `enabled`.
 *   dsn: SENTRY_DSN / GLZ_SENTRY_DSN · entorno: GLZ_ENV (o derivado) · release: GLZ_RELEASE · app: GLZ_APP
 */
export declare function initServidor(opts?: ConfigOpts): Promise<void>;
/** Reporta una excepción de servidor. `contexto` se anexa como dato extra. Nunca lanza. */
export declare function reportarErrorServidor(err: unknown, ctx?: {
    nivel?: Nivel;
    contexto?: string;
}): Promise<void>;
/** Reporta un mensaje (no-excepción) de servidor. Nunca lanza. */
export declare function reportarMensajeServidor(mensaje: string, ctx?: {
    nivel?: Nivel;
}): Promise<void>;
/**
 * Hook nativo de Next para `instrumentation.ts`:
 *   export { onRequestError } from '@glz/maintenance/server'
 * Next lo invoca ante errores de petición en servidor (nodejs y edge). Anexa el path como contexto.
 */
export declare function onRequestError(err: unknown, request?: {
    path?: string;
}): Promise<void>;
export {};
