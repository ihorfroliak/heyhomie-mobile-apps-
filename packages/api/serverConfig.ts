/**
 * Server configuration — validated, fail-fast. Pure so it's unit-tested here
 * (the server just calls `loadServerConfig(process.env)` and dies on a bad env
 * before opening a port). The app must NEVER boot with invalid configuration.
 */
export interface ServerConfig {
    databaseUrl: string;
    port: number;
    authSecret: string;
    devMode: boolean;
    production: boolean;
    /** Trust X-Forwarded-* (real client IP behind a reverse proxy / LB). */
    trustProxy: boolean;
    /** Per-IP rate-limit token bucket (configurable so it's testable + tunable). */
    rateCapacity: number;
    rateRefillPerSec: number;
}

export class ConfigError extends Error {
    constructor(public readonly issues: string[]) {
        super(`invalid configuration:\n - ${issues.join('\n - ')}`);
        this.name = 'ConfigError';
    }
}

const DEFAULT_SECRET = 'dev-secret-change-me';

/** Validate env → typed config, or throw ConfigError listing EVERY problem. */
export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
    const issues: string[] = [];
    const production = env.NODE_ENV === 'production';

    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) issues.push('DATABASE_URL is required');
    else if (!/^postgres(ql)?:\/\/.+/.test(databaseUrl)) issues.push('DATABASE_URL must be a postgres:// connection string');

    const authSecret = env.AUTH_SECRET;
    if (!authSecret) issues.push('AUTH_SECRET is required');
    else if (authSecret.length < 16) issues.push('AUTH_SECRET must be at least 16 characters');
    else if (production && authSecret === DEFAULT_SECRET) issues.push('AUTH_SECRET must not be the default value in production');

    const portRaw = env.PORT ?? '8090';
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push(`PORT must be an integer 1..65535 (got "${portRaw}")`);

    const devMode = env.AUTH_DEV_MODE === '1';
    if (production && devMode) issues.push('AUTH_DEV_MODE must be disabled in production');

    const trustProxy = env.TRUST_PROXY === '1';

    const rateCapacity = env.RATE_CAPACITY ? Number(env.RATE_CAPACITY) : 120;
    if (!Number.isInteger(rateCapacity) || rateCapacity < 1) issues.push(`RATE_CAPACITY must be a positive integer (got "${env.RATE_CAPACITY}")`);
    const rateRefillPerSec = env.RATE_REFILL ? Number(env.RATE_REFILL) : 20;
    if (!(rateRefillPerSec > 0)) issues.push(`RATE_REFILL must be a positive number (got "${env.RATE_REFILL}")`);

    if (issues.length) throw new ConfigError(issues);
    return { databaseUrl: databaseUrl as string, port, authSecret: authSecret as string, devMode, production, trustProxy, rateCapacity, rateRefillPerSec };
}
