# @heyhomie/domain

Framework-agnostic business core. **No React/React Native dependency** — pure
TypeScript, so it is unit-tested directly and shared by every app + the web.

## Modules

| File | Exports |
|------|---------|
| `cleaning.ts` | `CleaningPlan`, time calculator (`computeBaseMinutes`, `estimateMissionMinutes`, `MIN_MISSION_MINUTES`, `TRAVEL_BUFFER_MINUTES`), `addOns` + `addOnsFor`, `workersFor`, `scopeDisclaimers`, `goodToKnow` |
| `checklist.ts` | `checklistAreas` (8 areas, standard + `generalOnly`, pl/en/uk), `checklistFor(plan)`, `heavyWorkNote` |
| `missions.ts` | `Order`, `RecurringService`, `Mission`, `MissionStatus`, `isMissionEditable`, `FROZEN_STATUSES`, `PaymentMethod`, `Frequency` |
| `i18n.ts` | `Locale`, `tr`, `missionStatusLabel`, `frequencyLabel`, `formatDuration`, `formatMoney` |
| `selectors.ts` | `splitMissions`, `missionTimeline`, `workerAction`, `adminStats` |

## Rules captured here

- Time: bathroom 60 + kitchen 60 + room 30 + corridor 30, min 3h; add-ons add time.
- Add-ons: windows/ironing/balcony/extra-hours always; fridge/oven/hood/microwave/
  ventilator are free in general, paid add-on on standard (`includedInGeneral`).
- Staffing: general = 2 homies unless ≤60 m² or recurring.
- Status freeze: only `searching_homie` is editable.

## Test

```bash
npx -y tsx ../api/logic.test.ts        # uses this package
npx -y tsx i18n.test.ts
npx -y tsx selectors.test.ts
```
