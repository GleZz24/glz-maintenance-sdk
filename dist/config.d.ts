export interface ConfigResuelta {
    /** Nombre/slug de la app que identifica el origen (tag `app` en Sentry/Bugsink). */
    app: string;
    /** DSN de Sentry→Bugsink. `undefined` = reporter desactivado (no se inicializa). */
    dsn?: string;
    /** Release/SHA del deploy, para des-minificar stacks con los source maps. */
    release?: string;
    /** Entorno del que sale el reporte (p.ej. 'production', 'preview', 'dev'). */
    entorno: string;
    /** ¿Este entorno debe reportar? (false en local/tests salvo override). */
    activo: boolean;
}
/** Opciones que cualquier punto de entrada (cliente o servidor) puede sobreescribir. */
export interface ConfigOpts {
    app?: string;
    /** DSN de Sentry→Bugsink. Gana a las envs. Sin DSN (ni env) → reporter desactivado. */
    dsn?: string;
    release?: string;
    /** Etiqueta del entorno. En cliente conviene pasarla explícita (Next no inyecta accesos dinámicos). */
    entorno?: string;
    /** Allowlist: si se define, SOLO reportan los entornos de la lista (ignora el default). */
    soloEntornos?: string[];
    /** Por defecto NO se reporta desde 'development' (local). Ponlo a true para reportar también ahí. */
    reportarEnDesarrollo?: boolean;
}
/** Resuelve la config final aplicando la cascada opciones > env > default. */
export declare function resolverConfig(opts?: ConfigOpts): ConfigResuelta;
