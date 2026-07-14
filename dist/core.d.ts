import * as SentryBrowser from '@sentry/browser';
import { type ConfigOpts } from './config.js';
import { esRuidoSW, type OpcionesRuido } from './ruido.js';
export { esRuidoSW, type OpcionesRuido };
type Nivel = 'error' | 'warning';
type ClienteSentry = Pick<typeof SentryBrowser, 'init' | 'captureException'>;
/** @internal Solo para tests: sustituye el cliente Sentry real por un doble. */
export declare function __setSentryParaTests(doble: ClienteSentry): void;
/** @internal Solo para tests: restablece el estado del módulo entre casos. */
export declare function __resetParaTests(): void;
export interface InitOpts extends ConfigOpts, OpcionesRuido {
    /** Nivel por defecto de los errores reportados a mano sin nivel explícito. */
    nivelPorDefecto?: Nivel;
}
/**
 * Arranca el reporter: inicializa @sentry/browser (→ Bugsink) con el entorno, la release, el tag
 * `app` y el filtro de ruido. Idempotente. Sin DSN (ni por opción ni por env) NO inicializa Sentry
 * y el reporter queda desactivado, sin romper nada. El gating por entorno (local/test no reportan)
 * viaja en `enabled`, así que en desarrollo/CI Sentry queda deshabilitado y no envía.
 */
export declare function initMaintenance(opts?: InitOpts): void;
/**
 * Reporta un error manualmente. Fire-and-forget: nunca lanza ni bloquea la app. Si Sentry no está
 * inicializado (o está deshabilitado por entorno), `captureException` es un no-op nativo de Sentry.
 */
export declare function reportarError(err: unknown, ctx?: {
    url?: string;
    nivel?: Nivel;
}): void;
