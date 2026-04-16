---
tags: [architecture, data-flow, cs2]
status: active
last_updated: 2026-04-07
---

# Data Flow

How data moves through the app for each major user journey.

---

## 1. Match Analysis Flow

```
User searches or clicks match on Home
        ↓ matchup_id
Match Page (/match/[id])
        ↓ GET /api/analyze?matchup_id=[id]
        ↓
Analyze Service (lib/analyze-service.ts)
  ├── BL API → getMatchupStats(id)       # player stats for this match
  ├── BL API → getMatchupMeta(id)        # teams, status, score, times
  ├── BL API → getCompetitionSignups()   # resolve player → team mapping
  ├── Leetify API → getProfile(steam64)  # for each player (parallel)
  │         [rate-limited ~5 req/min]
  ├── aggregation.ts                     # compositeScore + blWeight + ci90
  ├── landing-analytics.ts               # win prob, edges, watchlist, axes
  └── post-analysis.ts (if played)       # economy, teamplay, development
        ↓ AnalyzeResponse (cached 5 min)
        ↓
AnalysisDisplay component
  ├── UpcomingMatchModules (pre-match)
  │     └── RadarChart, watchlist, tactical edge cards
  ├── PlayerDetail × N (per player)
  ├── MapPoolInsights
  ├── HeadToHeadBar, TeamComparisonBars
  └── EconomyFlow (post-match)
```

**BL API cache reuse:** `getMatchupStats` and `getMatchupMeta` results are cached 5 min in `bl-api.ts` and reused if the same matchup is requested again within the window (e.g., if user navigates back to the same match).

---

## 2. Player Profile Flow

```
User clicks player name in Match Analysis
        ↓ paradise_user_id
Player Page (/player/[id])
        ↓ GET /api/player?user_id=[id]
        ↓
PlayerProfileService (lib/player-profile-service.ts)
  ├── BL API → getUserMatchups(userId)   # historical match list
  ├── BL API → getMatchupStats × N       # stats per historical match
  ├── Leetify API → getProfile(steam64)  # current Leetify profile
  ├── detect-role.ts                     # classify ENTRY/AWP/SUPP/FRAG/ANCH
  └── Aggregate: trends, map records, multi-kills, clutches
        ↓ PlayerProfileResponse
        ↓
PlayerProfileDisplay component
  └── Role badge, score, trends, map table, Leetify section
```

**Steam64 resolution:** `paradise_user_id` → Steam64 via static `lib/players.ts` map. Players absent from this map get no Leetify data; the service gracefully omits those fields.

---

## 3. Division Overview Flow

```
User selects division or navigates to /division/[id]
        ↓ division_id
Division Page (/division/[id])
        ↓ GET /api/division?division=[id]
        ↓
DivisionService (lib/division-service.ts)
  └── BL API → getDivisionMatchups(divisionId)   # all matches
        Normalise status, scores, team logos
        ↓ DivisionResponse (cached 2 min)
        ↓
Page Component
  ├── Build standings table from completed matches
  ├── Render upcoming match cards
  └── For each upcoming match:
        ↓ GET /api/upcoming-preview?matchup_id=[id]   ← per match, waterfall risk
        ↓
        UpcomingPreviewService (lib/upcoming-preview.ts)
          ├── BL API → getMatchupStats (abbreviated)
          └── Skip Leetify → fast path
        ↓ UpcomingPreviewResponse
        ↓
        UpcomingPreviewPanel component
```

**Waterfall risk:** Each upcoming match fires a separate `/api/upcoming-preview` request on mount. With 6+ upcoming matches, this can produce 6 sequential fetches. Consider batching or expanding on user click.

---

## 4. Team Profile Flow

```
User clicks team name (from standings, match header, etc.)
        ↓ team_id
Team Page (/team/[id])
        ↓ GET /api/team?team_id=[id]
        ↓
TeamProfileService (lib/team-profile-service.ts)
  ├── BL API → getTeamPlayers(teamId)              # roster
  ├── BL API → getUserMatchups × roster            # history per player
  ├── detect-role.ts per player                    # role classification
  ├── map-pool.ts                                  # map win rates + confidence
  └── Compose economy notes, composition notes
        ↓ TeamProfileResponse (cached 90s in API route)
        ↓
TeamProfileDisplay component
  └── Roster table, map pool, match history, notes
```

---

## Shared Cache Layer

All BL API responses are cached in-memory inside `lib/bl-api.ts`:

```
Request → check cache → HIT → return cached
                      → MISS → check inflight map
                             → HIT (duplicate) → await same promise
                             → MISS → fetch BL API → cache → return
```

This means:
- A player profile page and a match analysis loading simultaneously for the same player will share the same BL API fetch.
- Cache is per-serverless-instance. Cold starts or multiple instances won't share cache — each warms independently.

---

## Type Definitions

All shared types in `lib/types.ts`:

| Type | Used In |
|------|---------|
| `AnalyzeResponse` | analyze-service → /api/analyze → Match Analysis |
| `PlayerAnalysis` | analyze-service, landing-analytics, post-analysis |
| `LandingAnalytics` | landing-analytics → AnalyzeResponse.landing |
| `PostAnalysis` | post-analysis → AnalyzeResponse.post_analysis |
| `PlayerProfileResponse` | player-profile-service → /api/player → Player Profile |
| `TeamProfileResponse` | team-profile-service → /api/team → Team Profile |
| `DivisionResponse` | division-service → /api/division → Division Overview |
| `Team` | Throughout (home/away) |
| `MapPoolEntry` | map-pool.ts, TeamProfileResponse, LandingAnalytics |
