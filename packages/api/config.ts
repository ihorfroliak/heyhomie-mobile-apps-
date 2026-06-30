/**
 * API endpoints for the HeyHomie backends (the existing Rails + Go services).
 * Base URLs taken from homie-api/docs/version.ini. Override per environment.
 */

export interface ApiConfig {
    /** Go API host (homie + admin), e.g. http://127.0.0.1:8080 */
    goBaseUrl: string;
    /** Rails API host (orders, users, payments) */
    railsBaseUrl: string;
}

export const API_PRESETS: Record<'local' | 'dev', ApiConfig> = {
    local: {
        goBaseUrl: 'http://127.0.0.1:8080',
        railsBaseUrl: 'http://127.0.0.1:3001',
    },
    dev: {
        goBaseUrl: 'https://heyhomie-api.dev.stuzer.link',
        railsBaseUrl: 'https://heyhomie-api.dev.stuzer.link',
    },
};

/** Path prefixes on the Go API (see homie-api/routes/*). */
export const GO_PREFIX = {
    homie: '/api/homie',
    admin: '/api/admin',
    website: '/api/website',
} as const;
