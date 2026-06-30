/**
 * Minimal typed HTTP client used by the real API clients.
 * Injectable `fetchImpl` keeps it unit-testable without a network.
 */

export class ApiError extends Error {
    constructor(public status: number, public body: unknown, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

export interface HttpConfig {
    baseUrl: string;
    /** Bearer token for the Go API (sent in the Authorization header). */
    token?: string;
    /** Override fetch (tests / non-browser runtimes). Defaults to global fetch. */
    fetchImpl?: typeof fetch;
}

export type Query = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
    body?: unknown;
    query?: Query;
    /** Per-request token override. */
    token?: string;
}

export function buildUrl(baseUrl: string, path: string, query?: Query): string {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    if (!query) return url;
    const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    return qs ? `${url}?${qs}` : url;
}

const safeJson = (text: string): unknown => {
    try {
        return text ? JSON.parse(text) : undefined;
    } catch {
        return text;
    }
};

export function createHttp(config: HttpConfig) {
    const doFetch = config.fetchImpl ?? globalThis.fetch;

    async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
        const headers: Record<string, string> = { Accept: 'application/json' };
        const token = opts.token ?? config.token;
        if (token) headers.Authorization = token; // Go API expects the raw token
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

        const res = await doFetch(buildUrl(config.baseUrl, path, opts.query), {
            method,
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        const data = safeJson(await res.text());
        if (!res.ok) {
            throw new ApiError(res.status, data, `${method} ${path} → ${res.status}`);
        }
        return data as T;
    }

    return {
        request,
        get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
        post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
        patch: <T>(path: string, opts?: RequestOptions) => request<T>('PATCH', path, opts),
        del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
    };
}

export type Http = ReturnType<typeof createHttp>;
