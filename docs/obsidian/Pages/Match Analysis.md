---
tags: [page, cs2]
status: active
last_updated: 2026-04-07
---

# Match Analysis Page

**Route:** `/match/[id]`
**File:** `app/match/[id]/page.tsx`
**Purpose:** Full tactical breakdown for a match — pre-match win probability and game plan, or post-match review if already played.

---

## Features

### Implemented ✅
- [x] Headline: team names, logos, match status
- [x] Win probability display (pre-match only)
- [x] Score display (post-match)
- [x] Team comparison bars (composite score, per-axis edges)
- [x] Top performers for each team
- [x] Game plan recommendations (pre-match)
- [x] Tactical sections: opening duels, trade structure, survival discipline, entry pressure, map leverage
- [x] Map pool analysis with veto hints → [[Components#MapPoolInsights]]
- [x] Radar chart for matchup axes → [[Components#RadarChart]]
- [x] Watchlist: initiators, form players, risk players
- [x] Player role detection badges (ENTRY / AWP / SUPP / FRAG / ANCH)
- [x] Post-match tactical review (economy proxies, teamplay, player development)
- [x] Error card with back-navigation on fetch failure
- [x] Links to per-player profiles and team profiles

### Partial 🚧
- [ ] Map pool veto hints only appear if ≥8 matches and ≥12% edge — may silently show nothing for new teams

### Missing ❌
- [ ] Live match polling / auto-refresh for in-progress matches
- [ ] "Share match analysis" link
- [ ] Historical head-to-head between the two teams

---

## API Calls

| Endpoint | Query Param | Purpose |
|----------|-------------|---------|
| `/api/analyze` | `matchup_id=[id]` | Full analysis — players, Bayesian scores, tactics, post-analysis |

---

## Components Used

- `AnalysisDisplay` — master visualization canvas (103KB) → [[Components#AnalysisDisplay]]
- `UpcomingMatchModules` — pre-match tactical cards, radar chart (34KB) → [[Components#UpcomingMatchModules]]
- `PlayerDetail` — per-player stat card in analysis (16KB) → [[Components#PlayerDetail]]
- `MapPoolInsights` — map analysis deep-dive (16KB) → [[Components#MapPoolInsights]]
- `PredictionCard` — win probability display → [[Components#PredictionCard]]
- `RadarChart` — matchup axes radar → [[Components#RadarChart]]
- `HeadToHeadBar` — side-by-side comparison bars → [[Components#HeadToHeadBar]]
- `TeamComparisonBars` → [[Components#TeamComparisonBars]]
- `IdentityBadge` → [[Components#IdentityBadge]]

---

## Data Shape

Consumes `AnalyzeResponse` from [[Services#analyze-service]]:
```ts
{
  home: Team,
  away: Team,
  landing: LandingAnalytics,      // pre-match tactical data
  post_analysis?: PostAnalysis,    // only if match played
  maps_played?: string[],
  meta: { rounds_fetched, leetify_attempts, duration_ms, ... }
}
```

---

## Navigation

- ← [[Home]] (back link)
- → [[Player Profile]] (click player name)
- → [[Team Profile]] (click team name)

---

## Coherence Notes

- `PlayerDetail` component links to `/player/[id]` — ensure `paradise_user_id` is always present in `PlayerAnalysis` or link will 404.
- Win probability is derived in [[Services#landing-analytics]] via Bayesian model; it's only shown pre-match. Post-match pages show the actual score instead — this is intentional but worth confirming UX is clear.
- Watchlist entries reference player IDs — if a player has no Leetify data, their watchlist signal confidence is lower; this is surfaced via the CI half-width but not explicitly labeled in the UI.
