/**
 * Real AuthCrypto (Build 18) — the ONLY place credential crypto lives, server-side
 * (node:crypto, never bundled in RN). Backs the pure `makeAuthService`:
 *  - passwords: scrypt with a per-user random salt, constant-time compare;
 *  - access token: the EXISTING HMAC token (signAuthToken) — format unchanged;
 *  - refresh token: 256-bit random, returned once; only its sha256 is stored.
 */
import crypto from 'node:crypto';
import type { AuthContext } from '@heyhomie/api';
import type { AuthCrypto } from '@heyhomie/api';
import { signAuthToken } from './auth.js';

const SCRYPT_KEYLEN = 64;

export function makeAuthCrypto(secret: string, accessTtlSec: number): AuthCrypto {
    return {
        newId: () => crypto.randomUUID(),

        hashPassword(password) {
            const salt = crypto.randomBytes(16).toString('base64');
            const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('base64');
            return { hash, salt };
        },

        verifyPassword(password, hash, salt) {
            const expected = Buffer.from(hash, 'base64');
            let actual: Buffer;
            try {
                actual = crypto.scryptSync(password, salt, expected.length || SCRYPT_KEYLEN);
            } catch {
                return false; // malformed stored hash
            }
            return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
        },

        mintAccess(identity: AuthContext, sid?: string) {
            return { token: signAuthToken(identity, secret, accessTtlSec, sid), expiresIn: accessTtlSec };
        },

        newRefresh() {
            const token = crypto.randomBytes(32).toString('base64url');
            return { token, hash: sha256(token) };
        },

        hashRefresh(token) {
            return sha256(token);
        },
    };
}

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('base64url');
}
