/** Run with: npx -y tsx packages/api/http.test.ts */
import { buildUrl, createHttp, ApiError } from './http';
import { createHomieClient } from './homieClient';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, cond: boolean) => (cond ? passed++ : fail.push(n));

interface Captured {
    url?: string;
    init?: RequestInit;
}

/** Fake fetch that records the call and returns a canned response. */
function makeFetch(cap: Captured, status = 200, body: unknown = { ok: true }): typeof fetch {
    return (async (url: string, init?: RequestInit) => {
        cap.url = String(url);
        cap.init = init;
        return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
}

// buildUrl
ok('buildUrl strips trailing slash', buildUrl('http://h/', '/api/x') === 'http://h/api/x');
ok('buildUrl encodes query', buildUrl('http://h', '/x', { a: 1, b: 'c d', skip: undefined }) === 'http://h/x?a=1&b=c%20d');

// auth header present / absent
(async () => {
    const cap: Captured = {};
    const http = createHttp({ baseUrl: 'http://h', token: 'tok123', fetchImpl: makeFetch(cap) });
    await http.get('/api/homie/auth/me');
    ok('sends Authorization when token set', (cap.init?.headers as Record<string, string>).Authorization === 'tok123');
    ok('GET has no body', cap.init?.body === undefined);

    const cap2: Captured = {};
    const http2 = createHttp({ baseUrl: 'http://h', fetchImpl: makeFetch(cap2) });
    await http2.get('/x');
    ok('no Authorization when token absent', (cap2.init?.headers as Record<string, string>).Authorization === undefined);

    // POST serializes body + content-type
    const cap3: Captured = {};
    const http3 = createHttp({ baseUrl: 'http://h', fetchImpl: makeFetch(cap3) });
    await http3.post('/x', { body: { phonenumber: '+48600' } });
    ok('POST sets Content-Type', (cap3.init?.headers as Record<string, string>)['Content-Type'] === 'application/json');
    ok('POST serializes JSON body', cap3.init?.body === JSON.stringify({ phonenumber: '+48600' }));

    // error path
    let threw: ApiError | undefined;
    const httpErr = createHttp({ baseUrl: 'http://h', fetchImpl: makeFetch({}, 401, { error: 'nope' }) });
    try {
        await httpErr.get('/x');
    } catch (e) {
        threw = e as ApiError;
    }
    ok('non-ok throws ApiError', threw instanceof ApiError && threw.status === 401);

    // homie client builds the right path
    const cap4: Captured = {};
    const homie = createHomieClient({ baseUrl: 'http://h', token: 't', fetchImpl: makeFetch(cap4) });
    await homie.beginMission('m42');
    ok('homie.beginMission hits the correct endpoint', cap4.url === 'http://h/api/homie/mission/m42/begin');
    ok('homie request is a POST', cap4.init?.method === 'POST');

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All http/client tests passed.');
})();
