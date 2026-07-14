import type { ErrorEvent, EventHint } from '@sentry/browser';
/** Ganchos del clasificador de ruido, extensibles por proyecto sin tocar el SDK. */
export interface OpcionesRuido {
    /**
     * Patrones extra para clasificar un rechazo como RUIDO. Se prueban contra el mensaje + stack
     * del `reason` (`hint.originalException`). ADITIVOS al filtro base (amplían, no sustituyen).
     * Ej: `patronesRuido: [/ResizeObserver loop/, /Non-Error promise rejection/]`.
     */
    patronesRuido?: RegExp[];
    /**
     * Gancho para clasificar un rechazo como RUIDO. Recibe el `reason` (`hint.originalException`) y
     * devuelve `true` para descartar. ADITIVO al filtro base. Fail-soft: si lanza, se ignora.
     * Ej: `filtroRuido: (r) => r instanceof Error && /Load failed/.test(r.message)`.
     */
    filtroRuido?: (reason: unknown) => boolean;
}
/**
 * ¿Es este evento RUIDO conocido (registro de SW / extensión) y debe descartarse antes de Bugsink?
 * Decide por el ORIGEN DEL STACK y el mensaje, nunca por palabras sueltas fuera de contexto.
 * Pura y a prueba de fallos: ante cualquier excepción devuelve `false` (fail-soft: preferimos
 * reportar de más antes que tragarnos un error real). `hint` aporta el `originalException` (reason)
 * sobre el que operan los ganchos del proyecto; `opts` son esos ganchos.
 */
export declare function esRuidoSW(event: ErrorEvent, hint?: EventHint, opts?: OpcionesRuido): boolean;
/**
 * Fabrica el `beforeSend` de Sentry a partir de los ganchos del proyecto. Descarta (devuelve
 * `null`) los eventos que `esRuidoSW` marca como ruido; el resto pasan intactos. Nunca lanza.
 */
export declare function crearBeforeSend(opts?: OpcionesRuido): (event: ErrorEvent, hint?: EventHint) => ErrorEvent | null;
