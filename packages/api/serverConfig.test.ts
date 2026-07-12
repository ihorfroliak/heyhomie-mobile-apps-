/** Run with: npx -y tsx packages/api/serverConfig.test.ts */
import { loadServerConfig, ConfigError } from './serverConfig';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
function issues(env: Record<string, string | undefined>): string[] {
    try { loadServerConfig(env); return []; } catch (e) { return e instanceof ConfigError ? e.issues : [String(e)]; }
}

const good = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', AUTH_SECRET: 'a-very-long-secret-key', PORT: '8090' };

// valid
const cfg = loadServerConfig(good);
eq('valid → port parsed', cfg.port, 8090);
eq('valid → devMode default false', cfg.devMode, false);
ok('valid → no throw', cfg.authSecret === 'a-very-long-secret-key');

// fail-fast, each required field
ok('missing DATABASE_URL flagged', issues({ ...good, DATABASE_URL: undefined }).some(i => i.includes('DATABASE_URL')));
ok('non-postgres URL flagged', issues({ ...good, DATABASE_URL: 'mysql://x' }).some(i => i.includes('DATABASE_URL')));
ok('missing AUTH_SECRET flagged', issues({ ...good, AUTH_SECRET: undefined }).some(i => i.includes('AUTH_SECRET')));
ok('short AUTH_SECRET flagged', issues({ ...good, AUTH_SECRET: 'short' }).some(i => i.includes('at least 16')));
ok('bad PORT flagged', issues({ ...good, PORT: 'abc' }).some(i => i.includes('PORT')));
ok('out-of-range PORT flagged', issues({ ...good, PORT: '70000' }).some(i => i.includes('PORT')));

// production hardening
ok('prod + default secret rejected', issues({ ...good, AUTH_SECRET: 'dev-secret-change-me', NODE_ENV: 'production' }).some(i => i.includes('default value in production')));
ok('prod + dev mode rejected', issues({ ...good, AUTH_DEV_MODE: '1', NODE_ENV: 'production' }).some(i => i.includes('AUTH_DEV_MODE')));

// SHUTDOWN_DRAIN_MS strict parse (Build 16 / C2): invalid must fail-fast, empty
// must default to 3000 (never 0 → the drain-skip bug).
ok('invalid SHUTDOWN_DRAIN_MS "3s" rejected', issues({ ...good, SHUTDOWN_DRAIN_MS: '3s' }).some(i => i.includes('SHUTDOWN_DRAIN_MS')));
ok('negative SHUTDOWN_DRAIN_MS rejected', issues({ ...good, SHUTDOWN_DRAIN_MS: '-5' }).some(i => i.includes('SHUTDOWN_DRAIN_MS')));
eq('empty SHUTDOWN_DRAIN_MS → default 3000 (not 0)', loadServerConfig({ ...good, SHUTDOWN_DRAIN_MS: '   ' }).shutdownDrainMs, 3000);
eq('valid SHUTDOWN_DRAIN_MS parsed', loadServerConfig({ ...good, SHUTDOWN_DRAIN_MS: '5000' }).shutdownDrainMs, 5000);

// aggregates ALL problems, not just the first
ok('reports every issue at once', issues({ PORT: 'x' }).length >= 3);
ok('ConfigError message lists issues', new ConfigError(['a', 'b']).message.includes('a') && new ConfigError(['a', 'b']).message.includes('b'));

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All serverConfig tests passed.');
