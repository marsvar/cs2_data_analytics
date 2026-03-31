# CS2 Analytics — Frontend Design Plan
*Written 2026-03-31. Comprehensive feature plan for the cs2-app Next.js frontend.*

---

## 1. Current State

The current UI is a single-page search tool:
- Matchup ID input → API call → two team cards side by side
- Each player shown as a row: name, power bar, composite score ±CI, data badge (BL/Leetify/combined)
- MetaBar: round count, Leetify profile count, sources, duration

**What we expose today:** composite score only. We have 6 rich stats per player in the response payload that are never shown.

---

## 2. Data Inventory — What We Already Have

Everything below comes from the existing `/api/analyze` response. No new backend work needed for P0/P1 features.

### Per player (PlayerAnalysis)
| Field | Description | Range |
|-------|-------------|-------|
| `score` | Bayesian composite | 0–1 |
| `ci` | 90% confidence interval | ±0–1 |
| `rounds` | Rounds played this match | 0–∞ |
| `kd` | Kill / Death ratio | 0–∞ |
| `kast` | Kill/Assist/Survived/Traded % | 0–1 |
| `dpr` | Damage per round | 0–∞ |
| `hs` | Headshot rate | 0–1 |
| `od_rate` | Opening duel win rate | 0–1 |
| `leetify.aim` | Aim percentile (global) | 0–100 |
| `leetify.positioning` | Positioning percentile | 0–100 |
| `leetify.utility` | Utility percentile | 0–100 |
| `leetify.ct_od` | CT-side opening duel win% | 0–1 |
| `leetify.t_od` | T-side opening duel win% | 0–1 |

### Team level (derived)
All team-level aggregates can be computed client-side by averaging player values.

---

## 3. Why Each Stat Matters (Evidence-Based)

### Opening Duel Rate (`od_rate`, `ct_od`, `t_od`)
**The single strongest predictor of round outcome.** 70–80% of rounds are won by whichever team gets the first kill. A player who wins opening duels consistently creates immediate man-advantage situations. Displaying this prominently isn't just aesthetically nice — it's the most analytically honest thing we can do.

CT vs T split matters enormously: a player with 55% CT OD but 35% T OD is a defensive anchor being overrun when attacking — not a "good player" overall. The aggregate hides this.

### KAST (`kast`)
**Most stable individual stat at low round counts.** While K/D needs ~400 rounds to stabilize, KAST stabilizes at ~100 rounds. For a 16-round match, KAST gives the most reliable signal. A player with 0.75 KAST is impacting their team almost every round even if kills are going to teammates. Measures *team contribution*, not just kills.

### DPR (`dpr`)
**Stabilizes faster than K/D (~150 rounds) and captures damage that doesn't convert to kills.** A player dealing 90 DPR but getting 0 kills is still breaking armor, setting up teammates. More honest than K/D for short samples.

### K/D (`kd`)
**Familiar, universally understood** — important for user trust. But explicitly noisy at low round counts. The CI visualization must make this clear.

### Headshot Rate (`hs`)
**Dual signal:** High HS% often indicates AWP usage (one-shot kills) or mechanical aim precision. Low HS% with high K/D can mean grenade kills or spraying — stylistically different players. **Context matters more than the number itself.** Useful for role detection (AWPer = HS > 60%).

### Leetify Aim/Positioning/Utility (percentiles)
**Prior data spanning many matches** — the Bayesian prior that stabilizes single-match noise. Positioning percentile is particularly underappreciated: it captures whether players take angles that maximize their chance of winning before the trigger is pulled.

### Confidence Interval (`ci`)
**The most honest thing this tool can show.** With 16–30 rounds per player, a ±6.0 CI means the score could be 3.0 or 9.0. Hiding uncertainty misleads decision-makers. Every score must always show its CI.

---

## 4. Feature Specification

### 4.1 Prediction / Advantage Card (P0)

**What:** A summary card above the team grid showing the matchup's "tactical verdict."

**Why:** The user's primary question is always "who is likely to win?" Give them the answer immediately before the details.

**Contents:**
```
┌─────────────────────────────────────────────────────┐
│  TAKTISK VURDERING                                  │
│                                                     │
│  [TEAM A]  ████████░░░░  62%  vs  38%  [TEAM B]    │
│                                                     │
│  Fordel A: t0bben (9.2), Mindseth (8.1)             │
│  Fordel B: Hcon (7.8), taghg (7.1)                  │
│                                                     │
│  ⚠ Lav konfidans — <50 runder per spiller           │
└─────────────────────────────────────────────────────┘
```

**Algorithm:**
- Win probability = softmax on team average scores (not raw %, this is relative strength)
- "Key threats" = top 2 players per team by score
- Warning if avg rounds < 50 per player
- If CI > score/2 for any player, show "Usikker analyse" notice

**Design:** Full-width, dark surface, accent border. The probability bar uses a split fill (home color left, away color right). No fake precision — round to nearest 5%.

---

### 4.2 Team Aggregate Comparison Bars (P0)

**What:** A dedicated section between MetaBar and the team cards showing each team's average for each stat, side by side.

**Why:** Currently the UI forces the user to mentally compare player rows across two separate cards. The aggregate view answers "which team is better at X?" directly.

**Stats shown:**
| Stat | Label | Reference (good/avg/bad) |
|------|-------|--------------------------|
| DPR | Skade/runde | >80 / 65 / <50 |
| KAST | KAST% | >0.75 / 0.65 / <0.55 |
| OD Win% | Åpne dueller | >0.55 / 0.50 / <0.45 |
| K/D | K/D | >1.2 / 1.0 / <0.8 |
| Aim (Leetify) | Sikte | percentile |
| Composite | Samlet styrke | 0–10 |

**Design:** Horizontal split bar where left fill = home, right fill = away, meeting in the middle. The winning side's bar is brighter. Label in center shows stat name. Tooltips explain what each stat means.

**Important:** If Leetify data is missing for most players, hide the Leetify rows rather than showing zeros.

---

### 4.3 Expandable Player Detail (P0)

**What:** Clicking a player row expands it to show the full stat breakdown inline.

**Why:** The current power bar + score view is a summary. Users who want to know *why* a player scored 7.2 need the raw stats. Progressive disclosure keeps the default view clean while rewarding curiosity.

**Expanded view contains:**

**Stat grid (6 stats, 2 columns):**
```
  K/D    1.42    │  DPR     88.3
  KAST   74%     │  HS%     52%
  OD%    58%     │  Runder  24
```

**Leetify section** (only if available):
```
  LEETIFY RATING
  Sikte        ████████░░  82/100
  Posisjonering  ████████░░  78/100
  Utility        ██████░░░░  61/100
  CT åpningsduel  58%
  T åpningsduel   42%
```

**Sample size warning** (if rounds < 50):
```
  ⚠ Kun 24 runder — høy statistisk usikkerhet (±6.7)
```

**Bayesian weight** (if combined):
```
  BL-vekt: 52% │ Leetify-vekt: 48%
  (krever ~100 runder for full BL-dominans)
```

**Design:** Smooth expand animation (height transition). The expanded area uses a slightly different background (surface2) to visually distinguish from the row.

---

### 4.4 Role Detection Badges (P1)

**What:** Auto-infer each player's likely role from their stats. Display as a small badge next to their name.

**Why:** A K/D of 1.4 means something very different for an entry fragger vs a lurker. Role context makes all other stats more interpretable.

**Detection logic:**

| Role | Badge | Criteria |
|------|-------|----------|
| Entry | `[ENTRY]` | OD rate > 0.52 AND KAST < 0.70 (commits, doesn't always survive) |
| AWPer | `[AWP]` | HS% > 0.55 AND DPR > 80 (high impact per kill, accuracy) |
| Support | `[SUPP]` | KAST > 0.75 AND K/D < 1.1 (contributes without top fragging) |
| Fragger | `[FRAG]` | K/D > 1.2 AND KAST > 0.65 AND OD < 0.52 (kills without entries) |
| Anchor | `[ANCH]` | CT OD > 0.55 AND T OD < 0.45 (strong defensively, weak offensively) |
| Default | none | Falls through all criteria |

**Notes:**
- These are heuristics, not ground truth. The badge should be styled subtly (outlined, not filled) to signal "inferred, not certain."
- Anchors only detectable with Leetify data.
- A tooltip on hover explains the criteria.

---

### 4.5 SVG Radar Chart (P1)

**What:** Per-player spider/radar chart with 5 axes. Pure SVG, no chart library dependency.

**Why:** Humans are good at recognizing shape. A star-shaped player profile (good at everything) reads differently from a spike shape (one-trick). The radar makes role and strengths immediately visible.

**Axes (normalized 0–1):**
1. **DPR** — `Math.min(dpr / 120, 1)`
2. **KAST** — raw (already 0–1)
3. **Opening Duels** — `od_rate`
4. **K/D** — `Math.min(kd / 2, 1)`
5. **Aim** — `leetify.aim / 100` (falls back to HS% if no Leetify)

**Design:**
- Concentric pentagons at 25%, 50%, 75%, 100% fill (dark stroke, no fill)
- Player polygon filled with accent color at 30% opacity, stroke at 70% opacity
- Axis labels at outer edge in `text-[9px] font-mono`
- Size: 120×120px, rendered inline within expanded player row
- No animation (respects reduced-motion by default)
- For "combined" data sources, render a second overlay polygon in a different color showing the Leetify-only profile vs BL match data

---

### 4.6 Side Split Display (P1)

**What:** Show CT vs T performance separately where Leetify data exists.

**Why:** CS2 is asymmetric by design. A player dominant on CT side may be passive and predictable on T side. Knowing this is tactically critical — it tells you *when* a player will be dangerous.

**Display:**
```
  SIDE-SPLIT (Leetify)
  CT  ████████░░  58%
  T   █████░░░░░  42%
  ← Defensiv spesialist
```

Labels:
- CT > 55%: "Defensiv spesialist"
- T > 55%: "Aggressiv spiller"
- Both > 52%: "Allsidig"
- Both < 48%: "Under press"
- Mix (one high, one low): "Asymmetrisk — sterkest på [side]"

---

### 4.7 Match URL Routing (P1)

**What:** Navigate to `/match/15846` directly instead of using the search form.

**Why:** Sharable links. Users want to send a specific analysis to teammates. Currently the result disappears on refresh.

**Implementation:**
- New route: `app/match/[id]/page.tsx`
- Server component that pre-fetches the analysis (no client-side fetch needed on load)
- The home page search form redirects to this URL on submit
- The match page also renders the same `AnalysisDisplay` component
- Back button / breadcrumb to return to search

**This changes the app architecture meaningfully:** the match result becomes a bookmarkable URL. No caching needed (always live-fetches), but the URL persists.

---

### 4.8 Division Browser (P2)

**What:** A page listing all matches in a division with quick "analyze" buttons.

**Why:** Users often want to analyze multiple matches to see how a team performs across rounds, not just one matchup. Currently requires knowing the matchup ID in advance.

**New API endpoint:** `GET /api/division?division_id=X`
- Calls `GET /matchup?division_id=X&limit=50` on BL API
- Returns list of matches: `{matchup_id, home_team, away_team, date, status}`

**UI:** A list/table of matches. Columns: Date, Home Team vs Away Team, Status, "Analyser →" button. Clicking opens the match analysis.

---

### 4.9 Player History Overlay (P2)

**What:** When Leetify data is available, show a sparkline or indicator of whether the player is trending up or down.

**Why:** A single-match performance is noisy. Leetify's global percentile rating reflects career-long performance. Comparing the two reveals "hot streaks" vs "slumps."

**Display:** Small arrow or delta indicator in the player row:
- BL match score significantly > Leetify prior = ↑ (outperforming career average)
- BL match score significantly < Leetify prior = ↓ (underperforming)
- Within ±0.5 of prior = → (consistent)

This is derivable from data already in the response (score vs the leetify prior score in buildPlayerAnalysis).

---

### 4.10 Copy as Report (P2)

**What:** A "Kopier analyse" button that generates a formatted text summary for pasting into Discord/Slack.

**Why:** These analyses will be shared in team chats. Give them the right format instead of screenshots.

**Format:**
```
CS2 ANALYSE — Matchup #15846
aSync vs NAS — 2026-03-31

aSync (styrke: 6.8 ±2.1)
  t0bben    9.2  (K/D 1.6, DPR 88, KAST 78%)
  Mindseth  8.1  (K/D 1.4, DPR 82, KAST 74%)
  ...

NAS (styrke: 5.9 ±1.8)
  Hcon      7.8  (K/D 1.3, DPR 79, KAST 72%)
  ...

Fordel: aSync (62% — lav konfidans, <30 runder/spiller)
```

---

## 5. Information Architecture

### Current
```
/ — single page with search form + inline result
```

### Target
```
/ — search form (home)
/match/[id] — shareable match analysis page
  ├── PredictionCard
  ├── MetaBar
  ├── TeamComparisonBars
  └── TeamsGrid
      ├── TeamCard (home)
      │   ├── TeamStatSummary (avg stats)
      │   └── PlayerRow × N (expandable)
      │       └── PlayerDetail (expanded)
      │           ├── StatGrid
      │           ├── RadarChart (SVG)
      │           ├── SideSplit
      │           └── DataQuality
      └── TeamCard (away)
          └── ...

/division/[id] — (P2) match list
```

---

## 6. Component Map

### New components to build:

| Component | Location | Dependencies |
|-----------|----------|--------------|
| `PredictionCard` | `components/prediction-card.tsx` | `Team[]` |
| `TeamComparisonBars` | `components/team-comparison-bars.tsx` | `Team, Team` |
| `PlayerDetail` | `components/player-detail.tsx` | `PlayerAnalysis` |
| `RadarChart` | `components/radar-chart.tsx` | `PlayerAnalysis` (pure SVG) |
| `SideSplit` | `components/side-split.tsx` | `LeetifyData` |
| `StatGrid` | `components/stat-grid.tsx` | `PlayerAnalysis` |
| `RoleBadge` | `components/role-badge.tsx` | `PlayerAnalysis` |
| `DataQualityBar` | `components/data-quality-bar.tsx` | `PlayerAnalysis` |

### Modified components:

| Component | Change |
|-----------|--------|
| `PlayerRow` | Add expand/collapse toggle, `RoleBadge` |
| `TeamCard` | Add team avg stats header |
| `AnalysisDisplay` | Add `PredictionCard`, `TeamComparisonBars` |

### New lib utilities:

| Utility | Purpose |
|---------|---------|
| `lib/derive-team-stats.ts` | Average/aggregate team stats from player array |
| `lib/detect-role.ts` | Role detection heuristics |
| `lib/win-probability.ts` | Softmax win probability from team scores |
| `lib/format-report.ts` | Text report generator for copy |

---

## 7. Data Normalization Reference

For consistent visualization across all charts/bars, use these normalization functions:

```typescript
// Normalize each stat to 0–1 for radar/comparison bars
const NORM = {
  dpr:  (v: number) => Math.min(v / 120, 1),        // 120 DPR = elite
  kast: (v: number) => v,                             // already 0–1
  kd:   (v: number) => Math.min(v / 2, 1),           // 2.0 KD = elite
  hs:   (v: number) => v,                             // already 0–1
  od:   (v: number) => v,                             // already 0–1
  aim:  (v: number) => v / 100,                       // Leetify percentile
}

// Reference lines for "average" display
const AVERAGE = {
  dpr: 65,    kast: 0.65,  kd: 1.0,
  hs: 0.40,   od: 0.50,    aim: 50,
}
```

---

## 8. Aesthetic Principles (consistent with existing UI)

- **Color semantics:** green (≥70%), yellow (50–70%), red (<50%) — never change these mappings
- **Typography:** `font-display` (Fira Code) for headers, labels, scores; `font-body` for explanatory text
- **Numbers always monospaced:** use `tabular-nums` on all stats to prevent layout shift
- **Confidence always visible:** never show a score without its ±CI
- **Progressive disclosure:** summary first, details on interaction
- **No chart libraries:** all visuals are pure SVG or CSS (`recharts`, `d3` etc. bring too much weight and styling conflict)
- **Reduced motion respected:** all animations behind `@media (prefers-reduced-motion: reduce)` guard
- **Touch targets ≥ 44px:** all interactive elements

---

## 9. Priority & Build Order

| Priority | Feature | Value | Effort | Reason |
|----------|---------|-------|--------|--------|
| P0 | Expandable player detail | High | Low | Data already in payload, just hidden |
| P0 | Team aggregate comparison bars | High | Low | 10 lines of math + straightforward UI |
| P0 | Prediction / advantage card | High | Medium | Win probability is the #1 user question |
| P1 | Role detection badges | Medium | Low | Pure client logic, no API changes |
| P1 | SVG radar chart | High | Medium | Best single visualization for player profile |
| P1 | Side split display | Medium | Low | Leetify data already in payload |
| P1 | Match URL routing | Medium | Medium | Architecture change, enables shareability |
| P2 | Division browser | Medium | High | Needs new API endpoint |
| P2 | Player history trend | Low | Low | Derivable, but limited by single-match data |
| P2 | Copy as report | Low | Low | Useful but not core |

---

## 10. What Not to Build (and Why)

**Live heatmaps / positional data:** Requires `.dem` file parsing (`awpy` Python library). Not feasible without a separate parser infrastructure.

**Economy tracking:** BL API doesn't expose buy/save data. Would need demo parsing.

**Round-by-round timeline:** No round-level data from BL API — only aggregates.

**Win rates vs specific opponents:** Would require scanning entire division history and joining across multiple matchup IDs. Complex, slow, and outside the single-match analysis scope.

**Automation / scheduled analysis:** Out of scope for the local-only deployment stage.

---

## 11. Open Questions

1. **Team name resolution:** Currently showing generic "TEAM" for both teams because `/matchup/{id}/stats` doesn't include team names and the separate `/matchup/{id}` call is inconsistent. Should we build a team name cache or tolerate generic names?

2. **Historical data:** To show trends, we need to store past analysis results. A simple JSON file cache in `/tmp` or local SQLite could work. Is this in scope?

3. **Language:** The current UI is Norwegian (runder, kilde, etc.). Should the full expanded UI also be Norwegian, or switch to English for technical terms?

4. **Leetify rate limiting:** At 3s between calls, a 10-player match takes ~30s just for Leetify. Should we show BL results first and stream Leetify data in as it arrives (requires streaming response changes)?
