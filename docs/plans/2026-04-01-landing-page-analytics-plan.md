# CS2 Analytics — Landing Page Plan
*Written 2026-04-01. Focused roadmap for high-value analytics modules on the home/landing page.*

---

## 1. Goal

Build a landing page that immediately answers:
1. Who has the tactical edge right now?
2. Where are each team’s map strengths and weaknesses?
3. How reliable are these conclusions?

The page should support both completed and future matchups (where no rounds are yet played) by using current registered rosters and historical priors.

---

## 2. What To Prioritize (Analytics Modules)

### P0 (Ship First)

1. **Tactical Edge Summary**
- Team advantage snapshot (win probability band, key players, confidence note).
- Inputs: existing `AnalyzeResponse` team/player scores + CI.

2. **Early-Round Edge**
- Team-level opening duel edge and “first death risk” framing.
- Inputs: existing `od_rate`, Leetify `ct_od`/`t_od` when available.

3. **Reliability Meter**
- Prominent uncertainty indicator: average rounds + high-CI warning.
- Inputs: existing `rounds`, `ci`.

4. **Form vs Baseline**
- Team trend marker from match score vs Leetify prior (hot/neutral/cold).
- Inputs: existing `score`, `leetify_prior`.

5. **Structure Signals**
- Trade structure edge, survival discipline edge and entry pressure edge.
- Inputs: BL extended stats when available; safe fallback to current landing model otherwise.

### P1 (Next)

6. **Map Strengths & Weaknesses**
- Best maps / weakest maps per team.
- Show: `map`, `win%`, `avg rating`, `sample size`, `confidence tag`.
- Inputs: Leetify `recent_matches` aggregated for currently registered roster.

7. **Veto Hint**
- “Suggested pick / avoid” derived from map strength overlap.
- Conservative language (“indikasjon”, not deterministic prediction).

### P2 (After)

8. **Division Context Strip**
- Lightweight mini-table: team form in division + opponent-relative rating.
- Inputs: BL division matchups and historical stats cache.

9. **Map Momentum Trend**
- Small sparkline for map-specific recent form (last 5 map samples).

---

## 3. Data Feasibility (Current vs Needed)

### Already available now
- BL per-player match stats (`kd`, `kast`, `dpr`, `hs`, `od_rate`, rounds).
- Leetify profile summary (`aim`, `positioning`, `utility`, `ct_od`, `t_od`).
- Match metadata + team rosters fallback for future matches.

### Extended BL fields now in scope
- `survival_ratio`
- `trade_kills`
- `traded_deaths`
- `firstkills`
- `clutches_won`
- `won_1v1` … `won_1v5`
- optional `damage_diff` / multi-kill enrichments only if present in raw BL payload

These fields should not replace the existing tactical edge model. They should extend landing analytics with:
- trade structure,
- survival discipline,
- entry pressure.

### Needed for Map Analytics
- Extend Leetify client output to include `recent_matches[]` fields:
  - `finished_at`
  - `map_name`
  - `outcome`
  - `leetify_rating`
- Aggregate by current team roster (not only players with present-match stats).
- Recency window for relevance: default 120 days (configurable).
- Minimum inclusion threshold:
  - player contributes only if `>= 5` recent map samples in window.

---

## 4. Public API Additions

### 4.1 `/api/analyze` extension
Add optional landing payload:

```ts
landing?: {
  reliability: {
    avg_rounds: number
    low_sample: boolean
    high_uncertainty: boolean
  }
  early_round_edge: {
    home_od: number
    away_od: number
    delta: number
    source: 'bl' | 'leetify' | 'combined'
  }
  form_vs_prior: {
    home_delta: number
    away_delta: number
  }
  map_pool?: {
    home: MapInsight[]
    away: MapInsight[]
    veto_hint?: {
      suggested_pick_for_home?: string
      suggested_pick_for_away?: string
      avoid_for_home?: string
      avoid_for_away?: string
    }
  }
}

// map-level
MapInsight = {
  map: string            // de_mirage
  win_rate: number       // 0-1
  avg_leetify_rating: number
  sample_size: number
  confidence: 'low' | 'medium' | 'high'
}
```

### 4.2 Optional endpoint (if we want modular loading)
`GET /api/map-pool?matchup_id=<id>`
- Returns just roster-based map analytics.
- Useful if we want landing widgets to stream independently later.

---

## 5. Ticket Backlog (Implementation-Ready)

### LP-01 — Landing analytics builder (P0)
**Scope**
- Add server helper `lib/landing-analytics.ts` that derives:
  - reliability,
  - early-round edge,
  - form-vs-prior,
from existing analyze payload.

**Done when**
- Helper has unit tests for edge cases (empty players, no Leetify, low rounds).
- `/api/analyze` includes `landing` object for existing matchups.

### LP-02 — Landing UI sections (P0)
**Scope**
- Update home page to include dedicated analytics panels:
  - Tactical edge,
  - Early-round edge,
  - Reliability meter,
  - Form vs baseline.
- Keep Norwegian copy and existing design language.

**Done when**
- Panels render for valid matchup.
- Friendly fallbacks shown if specific data not available.
- Mobile + desktop checked.

### LP-03 — Leetify recent matches ingestion (P1)
**Scope**
- Extend `lib/leetify-api.ts` types/parsing for `recent_matches[]`.
- Preserve rate-limit behavior and partial-failure tolerance.

**Done when**
- Parser returns normalized map rows with dates/outcomes/rating.
- Tests validate map parsing and empty/null behavior.

### LP-04 — Team map pool aggregator (P1)
**Scope**
- Add `lib/map-pool.ts`:
  - group by map,
  - compute roster-weighted win rate and avg rating,
  - assign confidence by sample size.
- Default relevance filter:
  - `last 120 days`,
  - ignore players with `<5` recent map samples.

**Done when**
- Deterministic output for controlled fixture data.
- Unknown maps handled safely.

### LP-05 — Map strengths/weaknesses UI (P1)
**Scope**
- Landing section for map insights:
  - strongest maps,
  - weakest maps,
  - sample and confidence badges.

**Done when**
- Both teams shown side-by-side.
- Missing-data state clearly explained.

### LP-06 — Veto hints (P1)
**Scope**
- Compute conservative pick/avoid suggestions from overlap logic.
- Add explanatory tooltip text.

**Done when**
- Hint shown only when sample confidence is sufficient.
- Hidden otherwise.

### LP-07 — Regression + build checks (P0/P1)
**Scope**
- Verify existing match page and division page unaffected.
- Run `npx tsc --noEmit` and `npm run build`.

**Done when**
- No route regressions.
- Build passes.

---

## 6. Statistical Guardrails

1. Do not present map win rates without sample sizes.
2. Confidence labels must degrade with small samples.
3. Do not mix eras unboundedly; use recency window.
4. For future matches, analytics must be roster-driven, not matchup-stat-driven.
5. Exclude players with no meaningful recent data from map models.
6. Do not let clutch or explosive-round fields drive pre-match verdicts without attempt context.
7. Treat `traded_deaths` as team-followup context, not a direct negative player score.

Suggested confidence bins for map sample size per team-map:
- `low`: `<8`
- `medium`: `8–19`
- `high`: `20+`

---

## 7. Delivery Sequence

### Sprint A (1–2 days)
- LP-01, LP-02, LP-07
- Outcome: landing page already feels analytical and trustworthy.

### Sprint B (2–3 days)
- LP-03, LP-04, LP-05
- Outcome: actionable map strengths/weaknesses live.

### Sprint C (1 day)
- LP-06 + polish
- Outcome: practical veto guidance with confidence gating.

---

## 8. Source Anchors

- HLTV Rating methodology context:
  - https://www.hltv.org/news/20695/introducing-rating-20
  - https://www.hltv.org/news/42485/introducing-rating-30
- HLTV map/first-kill context (map stats):
  - https://www.hltv.org/stats/maps/map/40/Overpass
- HLTV veto/map-pick conversion context:
  - https://www.hltv.org/news/35172/how-important-is-winning-your-map-pick
- First-kill and pistol-round study (334 major matches):
  - https://revistaaloma.blanquerna.edu/index.php/aloma/article/download/650/200200364/200202096
- Leetify rating context:
  - https://leetify.com/blog/introducing-leetify-rating/
  - https://leetify.com/blog/leetify-rating-update/
