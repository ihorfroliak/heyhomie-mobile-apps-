#!/usr/bin/env node
/**
 * Static sanity check for RN screens (which can't be type-checked here without
 * node_modules): bracket balance + forbidden raw glyphs (we standardized on
 * Ionicons; stray unicode ticks/stars/emoji mean a regression in the design
 * language). Run via `npm run check:apps`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['🎉', '✓', '💚', '⌃', '⌄', '›', '★', '🖼'];
const PAIRS = { '(': ')', '{': '}', '[': ']' };

// Anti-dependency rule (Build 03A): UI must reach order state ONLY via the
// OrderGateway. Direct store symbols are forbidden in app code — the barrel
// already hides them, this is the second, explicit barrier with a clear message.
// Store-specific names only (names shared with gateway methods like completeOrder
// are omitted to avoid false positives on legitimate orderGateway.* calls).
const FORBIDDEN_STORE_SYMBOLS = [
    'bookingStore', 'submitBooking', 'submitLeadCallback', 'settlePayment',
    'markOrderPaidByAdmin', 'getStoreDrafts', 'getStorePayments', 'getStoreLeads',
    'getStoreAccounts', 'getStoreCanceled', 'subscribeBookings', 'initBookingStore',
    'runNightlyCharges', 'settleOrderNow',
];

function findTsx(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) findTsx(full, out);
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

function checkBrackets(src) {
    const stack = [];
    for (const ch of src) {
        if (ch in PAIRS) stack.push(ch);
        else if (Object.values(PAIRS).includes(ch)) {
            const open = stack.pop();
            if (!open || PAIRS[open] !== ch) return `mismatched '${ch}'`;
        }
    }
    return stack.length ? `${stack.length} unclosed bracket(s)` : null;
}

const files = ['apps', 'packages/ui/src'].flatMap(d => findTsx(d));
let problems = 0;

for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const bracket = checkBrackets(src);
    if (bracket) {
        problems += 1;
        console.log(`FAIL ${f} — ${bracket}`);
    }
    for (const glyph of FORBIDDEN) {
        if (src.includes(glyph)) {
            problems += 1;
            console.log(`FAIL ${f} — raw glyph '${glyph}' (use Ionicons)`);
        }
    }
    // Only app code is gated; packages/ui is design-layer, not order state.
    if (f.startsWith('apps')) {
        for (const sym of FORBIDDEN_STORE_SYMBOLS) {
            if (new RegExp(`\\b${sym}\\b`).test(src)) {
                problems += 1;
                console.log(`FAIL ${f} — direct store symbol '${sym}' (use orderGateway)`);
            }
        }
    }
}

console.log(`\n${files.length} files checked · ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
