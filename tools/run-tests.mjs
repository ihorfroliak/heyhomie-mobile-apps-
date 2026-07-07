#!/usr/bin/env node
/**
 * Test runner: discovers every *.test.ts under packages/ and runs each with tsx.
 * No hardcoded file list — a new test file is picked up automatically.
 * Exits non-zero if any file fails. Run via `npm test`.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function findTests(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) findTests(full, out);
        else if (entry.name.endsWith('.test.ts')) out.push(full);
    }
    return out;
}

const files = findTests('packages').sort();
let failedFiles = 0;
let totalPassed = 0;

for (const f of files) {
    const res = spawnSync('npx', ['-y', 'tsx', f], { encoding: 'utf8', shell: process.platform === 'win32' });
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const counts = out.match(/(\d+) passed, (\d+) failed/);
    if (res.status !== 0) {
        failedFiles += 1;
        console.log(`FAIL ${f}`);
        console.log(out.trim());
    } else {
        totalPassed += counts ? Number(counts[1]) : 0;
        console.log(`ok   ${f}${counts ? ` · ${counts[1]}` : ''}`);
    }
}

console.log(`\n${files.length} files · ${totalPassed} assertions passed · ${failedFiles} file(s) failed`);
process.exit(failedFiles ? 1 : 0);
