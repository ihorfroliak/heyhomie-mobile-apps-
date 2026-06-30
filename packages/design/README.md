# @heyhomie/design

Single source of truth for the brand look — used by `@heyhomie/ui` and the apps.

## Tokens (`tokens.ts`)

- `colors` — brand (`primary`, `salad`, `pink`, `blue`, `grey`, `bgLight`),
  semantic (`success`, `warning`, `danger`, `info`) and `colors.status` keyed by
  `MissionStatus`.
- `spacing` — `xs … xxl` (4 → 32).
- `radii` — `sm`, `md`, `lg`, `pill`.
- `typography` — fonts (Quicksand headings, Lato body), `sizes`, `weights`.
- `shadow.card` — the standard raised-card elevation.

```ts
import { colors, spacing, radii, typography } from '@heyhomie/design';
```

Pure data, no dependencies — safe to import anywhere.
