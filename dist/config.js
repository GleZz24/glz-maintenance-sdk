// Resolución de configuración del reporter: opciones explícitas > variables de
// entorno > default. La lógica de app/entorno/release/activo/soloEntornos/
// reportarEnDesarrollo es la parte PLUG&PLAY y NO cambia entre v0.x y v1.x; lo
// único que se sustituye es `endpoint` (motor casero) por `dsn` (Sentry→Bugsink).
//
// A diferencia del endpoint casero, el DSN NO tiene default: sin DSN el reporter
// queda DESACTIVADO (no se inicializa Sentry) y no rompe nada. El DSN de Sentry es
// público (no lleva secretos), igual que el modelo DSN de siempre.
//
// En el bundle de CLIENTE, Next/Vite solo inyectan en el navegador los **literales**
// (`process.env.NEXT_PUBLIC_*`, `import.meta.env.VITE_*`), no los accesos dinámicos.
// Por eso en el cliente se pasan `app`, `entorno` y `dsn` explícitos a
// initMaintenance; en SERVIDOR (Node) todo se resuelve de entorno sin tocar nada.
// Entornos que NO reportan por defecto: local y los TESTS (CI/runner ponen NODE_ENV='test').
// Evita que el test suite ensucie Bugsink con errores sintéticos.
const NO_REPORTAN = new Set(['development', 'test']);
function env(clave) {
    return typeof process !== 'undefined' && process.env ? process.env[clave] : undefined;
}
/**
 * Deriva el entorno sin configuración, sea cual sea el host. La forma fiable y
 * AGNÓSTICA es que el proyecto fije `GLZ_ENV` (servidor) / pase `entorno` (cliente);
 * esto es solo el autodetect de cortesía cuando no se ha fijado nada:
 *  1. Vercel (zero-config allí): production directo; si no, la RAMA de git distingue
 *     dev/preview (Vercel comparte VERCEL_ENV='preview' para ambos).
 *  2. Genérico (Docker, VPS, Railway, Render, Fly, local…): NODE_ENV.
 *  3. Sin pistas → 'development'.
 */
function derivarEntorno() {
    const vercelEnv = env('NEXT_PUBLIC_VERCEL_ENV') || env('VERCEL_ENV');
    if (vercelEnv === 'production')
        return 'production';
    if (vercelEnv) {
        const rama = env('NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF') || env('VERCEL_GIT_COMMIT_REF');
        return rama || vercelEnv;
    }
    const nodeEnv = env('NODE_ENV');
    if (nodeEnv === 'production')
        return 'production';
    if (nodeEnv)
        return nodeEnv;
    return 'development';
}
/** Resuelve la config final aplicando la cascada opciones > env > default. */
export function resolverConfig(opts) {
    const app = opts?.app || env('NEXT_PUBLIC_GLZ_APP') || env('GLZ_APP') || 'desconocida';
    // DSN sin default: cliente usa NEXT_PUBLIC_SENTRY_DSN; servidor SENTRY_DSN/GLZ_SENTRY_DSN.
    // Se prueban todas para que un mismo resolver valga en ambos lados (en cliente solo
    // el literal NEXT_PUBLIC_* llega inyectado; el resto quedan en undefined y no molestan).
    const dsn = opts?.dsn ||
        env('NEXT_PUBLIC_SENTRY_DSN') ||
        env('SENTRY_DSN') ||
        env('GLZ_SENTRY_DSN') ||
        undefined;
    const release = opts?.release || env('NEXT_PUBLIC_RELEASE') || env('GLZ_RELEASE') || undefined;
    const entorno = opts?.entorno || env('NEXT_PUBLIC_GLZ_ENV') || env('GLZ_ENV') || derivarEntorno();
    // Por defecto NO se reporta desde entornos no productivos (local y, sobre todo, TESTS:
    // un reporter jamás debe disparar envíos reales cuando corre el test suite/CI).
    const activo = opts?.soloEntornos
        ? opts.soloEntornos.includes(entorno)
        : !NO_REPORTAN.has(entorno) || opts?.reportarEnDesarrollo === true;
    return { app, dsn, release, entorno, activo };
}
