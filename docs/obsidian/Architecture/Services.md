---
tags: [architecture, services, cs2]
status: active
last_updated: 2026-04-07
---

# Services (`lib/`)

All business logic lives in `lib/`. Services are called by API route handlers — never directly from page components.

---

## analyze-service

**File:** `lib/analyze-service.ts`
**Export:** `analyzeMatchup(matchupId: number): Promise<AnalyzeResponse>`
**Used by:** `/api/analyze`, `/api/upcoming-preview`

Five-step pipeline:
1. Fetch BL match stats + meta (`matchup/[id]/stats`, `matchup/[id]`)
2. Resolve player rosters from signup data
3. Fetch Leetify profiles in parallel for all players (with rate-limit awareness)
4. Build `PlayerAnalysis` per player via [[Services#aggregation]] (Bayesian blend, CI)
5. Derive [[Services#landing-analytics]] (pre-match) and [[Services#post-analysis]] (if played)

Result cached 5 min keyed by `matchupId`.

---

## bl-api

**File:** `lib/bl-api.ts`
**Purpose:** Bedriftsligaen Paradise v2 API client
**Base URL:** `https://app.bedriftsligaen.no/api/paradise/v2`
**Auth:** `Authorization: Bearer {BL_TOKEN}`

Key functions:
- `getMatchupStats(id)` — player stats for one match
- `getMatchupMeta(id)` — match meta (teams, status, times, scores)
- `getTeamPlayers(teamId)` — roster
- `getDivisionMatchups(divisionId)` — all matches in a division
- `getUserMatchups(userId)` — historical matches for a player
- `getUser(userId)` — BL user profile (Steam accounts)
- `getCompetitions()` — list all seasons
- `getCompetitionSignupTeams(competitionId)` — all teams in a season

Includes in-memory TTL cache + inflight deduplication per endpoint.

---

## leetify-api

**File:** `lib/leetify-api.ts`
**Purpose:** Leetify public API client
**Base URL:** `https://api-public.cs-prod.leetify.com`
**Auth:** `Authorization: Bearer {LEETIFY_TOKEN}`

- `getProfile(steam64Id)` — full player profile
  - Returns: `aim`, `positioning`, `utility` (0–100 percentiles), `clutch`, `opening_duel_success`, `ct_opening_duel`, `t_opening_duel`, `reaction_time`
- Rate limit: ~5 req/min → `time.sleep(3)` equivalent between calls
- Player mapping: Steam64 → BL `paradise_user_id` via `lib/players.ts` static map

---

## aggregation

**File:** `lib/aggregation.ts`
**Purpose:** Bayesian composite score + confidence interval

```ts
compositeScore(dpr, kast, od_rate, kd, hs): number  // 0–1 scale
blWeight(effectiveRounds): number                    // 0–0.75, BL data trust
ci90(n, variance): number                            // 90% CI half-width
```

Blends BL rating (rolling 180d) with Leetify composite score:
- Recency weights: 30d = 1.0, 90d = 0.7, 180d = 0.4
- BL weight increases with round count; caps at 0.75 (Leetify always has some weight)
- CI stabilises at ~150 rounds for ADR/DPR vs ~400 for K/D

---

## landing-analytics

**File:** `lib/landing-analytics.ts`
**Export:** `deriveLandingAnalytics(home, away, playerAnalyses): LandingAnalytics`
**Purpose:** Derives all pre-match tactical insights

Produces:
- `win_probability` — Bayesian home/away win %
- `early_round_edge` — opening duel advantage
- `trade_structure_edge` — from BL advanced stats
- `survival_discipline` — KAST + survival ratio
- `entry_pressure` — first kill rate + opening duels
- `map_leverage` — veto advantage (recent 180d map pool)
- `form_vs_prior` — 90d recent vs lifetime baseline
- `matchup_axes` — radar chart data (6 axes)
- `watchlist` — initiators, form players, risk players

---

## player-profile-service

**File:** `lib/player-profile-service.ts`
**Export:** `buildPlayerProfile(userId): Promise<PlayerProfileResponse>`
**Used by:** `/api/player`

Aggregates:
- BL match history (all historical matchups)
- Map records (win rate, K/D, KAST per map)
- Trend windows (last 5/10/20)
- Multi-kill and clutch stats
- Leetify data (via [[Services#leetify-api]])
- Role detection (via [[Services#detect-role]])

---

## team-profile-service

**File:** `lib/team-profile-service.ts`
**Export:** `buildTeamProfile(teamId): Promise<TeamProfileResponse>`
**Used by:** `/api/team`

Aggregates:
- Roster from BL API
- Map pool with win rates and confidence levels
- Match history (recent results)
- Economy notes (derived from match patterns)
- Composition notes (auto-generated from role distribution)

---

## division-service

**File:** `lib/division-service.ts`
**Export:** `getDivisionData(divisionId): Promise<DivisionResponse>`
**Used by:** `/api/division`

- Fetches all matches for a division
- Normalises status (infers from scores if BL status unclear)
- Parses scores, team logos, match times
- Returns `DivisionResponse` with matches indexed by `matchup_id`

---

## match-search-service

**File:** `lib/match-search-service.ts`
**Export:** `searchMatches(query, divisionId?, limit?): Promise<MatchSearchResult[]>`
**Used by:** `/api/match-search`

- Fetches division matchups and fuzzy-matches team names against query
- Optional division filter
- Used for typeahead on [[Home]]

---

## detect-role

**File:** `lib/detect-role.ts`
**Export:** `detectRole(stats): { role: Role, confidence: 'low'|'medium'|'high' }`

Classifies players as: `ENTRY | AWP | SUPP | FRAG | ANCH`

Rules (approximate):
- High opening duel % → ENTRY
- High utility damage → SUPP
- High DPR → FRAG
- High survival ratio → ANCH
- (AWP detection requires Leetify sniper data or explicit stat)

---

## map-pool

**File:** `lib/map-pool.ts`
**Purpose:** Map performance aggregation + veto hint generation

- Aggregates win rates per map with sample size
- Confidence: low (<8 matches), medium (8–20), high (>20)
- Veto hints: only if ≥8 matches AND ≥12% win rate edge
- Used in both [[Services#analyze-service]] and [[Services#team-profile-service]]

---

## post-analysis

**File:** `lib/post-analysis.ts`
**Export:** `buildPostAnalysis(matchStats, playerAnalyses): PostAnalysis`
**Purpose:** Post-match tactical review (only runs if match is played)

Produces:
- Tactical control indicators (opening edge, pressure, stability)
- Economy proxies (derived from round outcomes)
- Teamplay metrics (trade kills, assist rates)
- Player development analysis (overperforming vs baseline)
- Coach recommendations

---

## upcoming-preview

**File:** `lib/upcoming-preview.ts`
**Export:** `buildUpcomingPreview(matchupId): Promise<UpcomingPreviewResponse>`
**Used by:** `/api/upcoming-preview`

Abbreviated version of [[Services#analyze-service]] — skips Leetify fetching for speed. Used by [[Division Overview]] to show quick previews for multiple upcoming matches.
