# Security

Practices baked into the HeyHomie apps. This is engineering guidance — pair it
with the legal docs in `/legal` (GDPR / RODO).

## Secrets & tokens
- **Never commit secrets.** API base URLs are config (`packages/api/config.ts`);
  tokens and keys come from the environment — see `.env.example`. `.gitignore`
  excludes `.env*` and `secrets/`.
- The Go API bearer token is stored via a **secure store** (`packages/api/session.ts`):
  native apps back `SecureStore` with `expo-secure-store` (iOS Keychain / Android
  Keystore). Never store tokens in plain AsyncStorage/localStorage.
- Tokens are sent only in the `Authorization` header — **never in the URL** or query
  string (`buildUrl` keeps them out).

## Input handling
- Validate before sending: `isValidEmail`, `isValidPhone` (E.164), `sanitizeText`,
  `clampLength` in `packages/domain/validation.ts`.
- Treat all server data as untrusted in the UI; render text, avoid `dangerouslySet*`
  on unsanitized HTML.

## Transport
- HTTPS only in dev/prod (`API_PRESETS.dev` is https). Reject mixed content.
- `ApiError` surfaces non-2xx without leaking response internals to users.

## Privacy by design (GDPR / RODO)
- Consent captured + versioned (`packages/domain/consent.ts`); required consents
  (terms, privacy) enforced before account use.
- Data-subject rights wired in the client app: **export** and **account erasure**
  (Profile → Privacy & data) → `makeDataRequest('export' | 'erasure', …)`.
- Cleaners receive only the minimum data needed for a mission (data minimization).

## Auth
- Passwordless phone OTP (no passwords stored client-side). Sign-out wipes the
  token from secure storage (`session.clear()`).

## Dependencies
- Keep Expo SDK and libraries current; run `npm audit` in CI.

## Reporting
- Report vulnerabilities privately to [security@ email] — do not open public issues.
