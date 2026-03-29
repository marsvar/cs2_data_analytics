# CS2 Analytics App — Design Document
*2026-03-29*

## Context

The project currently produces a static `match-analysis.html` file with hardcoded data. The goal is to replace this with a dynamic Next.js app where you can enter a Bedriftsligaen matchup ID and get a full analysis automatically — pulling live data from the BL API and Leetify, running Bayesian aggregation, and displaying power rankings, confidence intervals, and tactical insights.

**Outcome**: A locally-running Next.js app with a `/api/analyze?matchup_id=X` endpoint and a minimal but visually distinctive frontend that renders the analysis.

---

## Architecture

**Stack**: Next.js 15 (App Router), TypeScript, run locally with `next dev`.

```
app/
  api/analyze/route.ts     ← Main API endpoint
  page.tsx                 ← Search UI
lib/
  bl-api.ts                ← BL API client (port of fetch_match_stats.py)
  leetify-api.ts           ← Leetify API client (port of fetch_leetify.py)
  aggregation.ts           ← Bayesian aggregation (port of aggregate_player_stats.py)
  types.ts                 ← Shared TypeScript types
```

---

## API Design

**`GET /api/analyze?matchup_id={id}`**

### Flow
1. Call `GET /matchup/{id}/stats` on BL API → get match player stats
2. For each player with a known Steam ID: fetch Leetify profile with 3s rate-limit delay
3. Run Bayesian aggregation: `compositeScore()`, `blWeight()`, `ci90()`, `bayesianCombine()`
4. Return typed JSON

### Response Shape

```ts
type AnalyzeResponse = {
  matchup_id: number
  teams: {
    home: Team
    away: Team
  }
  meta: {
    rounds_fetched: number
    leetify_count: number
    data_sources: string[]
    fetched_at: string
  }
}

type Team = {
  id: number
  name: string
  players: PlayerAnalysis[]
}

type PlayerAnalysis = {
  name: string
  score: number         // composite 0–1
  ci: number            // 90% CI half-width
  rounds: number
  kd: number
  kast: number          // 0–1
  dpr: number
  hs: number            // 0–1
  od_rate: number       // opening duel win rate 0–1
  leetify?: {
    aim: number
    positioning: number
    utility: number
    ct_od: number       // CT-side opening duel win rate
    t_od: number        // T-side opening duel win rate
  }
  data_source: 'bl' | 'leetify' | 'combined'
}
```

### Error Handling
- 90s timeout on the full request
- Partial results if Leetify fails for some players (data_source stays 'bl')
- JSON error field when the matchup_id is invalid

---

## TypeScript Ports

### `lib/bl-api.ts`
Port of `scripts/fetch_match_stats.py`.

Key functions:
- `blGet<T>(endpoint: string, token: string): Promise<T>` — authenticated GET
- `getMatchupStats(matchupId: number, token: string): Promise<BLMatchupStats>` — player stats for one match
- `getDivisionMatchups(divisionId: number, token: string): Promise<BLMatchup[]>`

### `lib/leetify-api.ts`
Port of `scripts/fetch_leetify.py`.

Key functions:
- `getProfile(steam64: string, token: string): Promise<LeetifyProfile>` — full profile
- `extractRelevant(profile: LeetifyProfile): LeetifyRelevant` — extract rating + stats fields
- Rate limiting: `delay(3000)` between calls

### `lib/aggregation.ts`
Port of `scripts/aggregate_player_stats.py`.

Key functions:
- `compositeScore(dpr, kast, odRate, kd, hs): number` — weighted 0–1 score
- `blWeight(effectiveRounds, contextMult?, priorStrength?): number` — Bayesian BL weight (capped at 0.75)
- `ci90(kast, odRate, dpr, kd, rawRounds, odCount): number` — 90% CI half-width
- `bayesianCombine(blStats, leetifyPrior, blWeight): PlayerAnalysis` — posterior estimate

Recency weights (from CLAUDE.md):
```ts
const WEIGHTS = {
  qual_r1: 0.5, qual_r2: 0.6, qual_r3: 0.7,
  bl_r1: 0.7, bl_r2: 1.0, bl_r3: 1.5
}
```

---

## Frontend Design

**Aesthetic**: Dark terminal/tactical. Inspired by radar screens and operator dashboards. Sharp, high-contrast, data-dense.

**Design tokens** (to be generated via ui-ux-pro-max before implementation):
- Run: `python3 skills/ui-ux-pro-max/scripts/search.py "esports analytics dark data dashboard tactical" --design-system -p "CS2 Analytics"`
- Persist: add `--persist` to save to `design-system/MASTER.md`

**Typography direction** (frontend-design skill):
- Display/heading: condensed sans or monospace with character (e.g. Barlow Condensed, Share Tech Mono, Bebas Neue)
- Body/data: clean tabular numerics (e.g. JetBrains Mono, IBM Plex Mono)
- NOT: Inter, Roboto, Arial, Space Grotesk

**Color**:
- Base from existing `match-analysis.html`: `--bg:#0d0f14`, `--surface:#161a23`, `--accent:#4f8ef7` (aSync blue), `--accent2:#f7834f` (NAS orange)
- Enhance with subtle scan-line/noise texture overlay

**Components** (via 21st.dev Magic MCP):
- Search input with matchup ID field
- Submit button with loading state
- Progress indicator ("Fetching Leetify 3/5...")

**Page structure (v1)**:
```
Header: "CS2 ANALYSE" wordmark + data source badges
Search form: matchup ID input → submit
Loading state: progress bar + step label
Result: team header, power ranking bars, full stats table
```

---

## How the Specified Tools Are Used

| Tool | When | How |
|------|------|-----|
| **ui-ux-pro-max** | Before writing any CSS | Run `search.py --design-system` for color, typography, spacing tokens. Persist to `design-system/MASTER.md`. |
| **frontend-design skill** | When implementing components | Invoke to get aesthetic direction, typography choices, animation guidance. Bold dark terminal direction. |
| **21st.dev Magic MCP** | When building UI components | Use Magic to pull pre-built search input, button, progress components from the 21st.dev registry. |
| **context7 MCP** | When writing Next.js code | Fetch current Next.js 15 Route Handler docs, App Router patterns, and any library docs needed. |

---

## Build Sequence

1. **Scaffold**: `npx create-next-app@latest` with TypeScript + App Router + Tailwind
2. **Design system**: Run ui-ux-pro-max, persist design tokens
3. **Types**: Write `lib/types.ts` from API response shapes above
4. **BL client**: `lib/bl-api.ts` — port Python HTTP calls
5. **Leetify client**: `lib/leetify-api.ts` — port with rate limiting
6. **Aggregation**: `lib/aggregation.ts` — port math functions
7. **Route Handler**: `app/api/analyze/route.ts` — wire up the pipeline
8. **Frontend**: `app/page.tsx` — search form + result display with 21st.dev components + frontend-design aesthetic
9. **Polish**: Apply ui-ux-pro-max pre-delivery checklist

---

## Verification

1. Start: `npm run dev` → `http://localhost:3000`
2. Enter matchup ID `15810` (known aSync match) in the search form
3. Confirm response returns within 90s with both teams, player scores, CI values
4. Verify Leetify data is combined for players with known Steam IDs
5. Confirm error handling: invalid matchup ID returns `{ error: "..." }`
6. Check that `compositeScore` values match the hardcoded values in `match-analysis.html` (e.g. t0bben ≈ 8.61)
