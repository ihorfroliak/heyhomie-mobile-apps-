# @heyhomie/ui

Shared React Native components, themed by `@heyhomie/design` and localized via the
built-in locale context. Used by all three apps.

## Components

| Export | Purpose |
|--------|---------|
| `Button` | Brand button — `primary` / `teal` (CTA) / `ghost`, with `loading` + `disabled` |
| `Card` | `raised` (white + shadow) or `fill` (light surface) |
| `StatusBadge` | Localized, colour-coded mission status pill |
| `MissionCard` | Reusable mission summary (status, plan, time, homie, price) |
| `Segmented` | iOS-style tab toggle (e.g. Orders / Services) |
| `EmptyState` | Placeholder for empty lists |

## Locale

```tsx
import { LocaleProvider, useLocale, useSetLocale } from '@heyhomie/ui';

// app/_layout.tsx
<LocaleProvider initial="en">{children}</LocaleProvider>

// any screen
const locale = useLocale();        // 'pl' | 'en' | 'uk'
const setLocale = useSetLocale();  // switch language
```

Peer deps: `react`, `react-native`. Not type-checked in this repo's CI (needs RN
types) — validated on device via Expo.
