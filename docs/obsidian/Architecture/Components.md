---
tags: [architecture, components, cs2]
status: active
last_updated: 2026-04-07
---

# Components

All shared components live in `components/`. Page-specific rendering is handled by these components, not by page files directly.

---

## Core Visualization Components

### AnalysisDisplay
**File:** `components/analysis-display.tsx` (~103KB)
**Used by:** [[Match Analysis]]
**Purpose:** Master canvas for a full match analysis — renders all tactical sections, player details, charts, and game plan.

Contains sub-sections:
- Team header with win probability
- Tactical edge cards (opening duels, trade, survival, entry, map)
- Player roster with `PlayerDetail` per player
- `MapPoolInsights` section
- Post-match review (if applicable)

### UpcomingMatchModules
**File:** `components/upcoming-match-modules.tsx` (~34KB)
**Used by:** [[Match Analysis]]
**Purpose:** Pre-match tactical cards — radar chart, matchup axes, watchlist, veto flow.

Contains:
- `RadarChart` matchup axes
- Watchlist (initiators, form players, risk players)
- Tactical edge summary cards

### PlayerProfileDisplay
**File:** `components/player-profile-display.tsx` (~22KB)
**Used by:** [[Player Profile]]
**Purpose:** Full player stat sheet.

Contains:
- Role badge + composite score
- Trend windows (last 5/10/20)
- Map records table
- Leetify data section (aim, positioning, utility, clutch)
- CT/T side split
- Multi-kill and clutch tables

### TeamProfileDisplay
**File:** `components/team-profile-display.tsx` (~16KB)
**Used by:** [[Team Profile]]
**Purpose:** Team composition overview.

Contains:
- Roster with role badges
- Role distribution summary
- Map pool table with confidence indicators
- Economy and composition notes

### PlayerDetail
**File:** `components/player-detail.tsx` (~16KB)
**Used by:** [[Match Analysis]] (via `AnalysisDisplay`)
**Purpose:** Single-player stat card within a match analysis — BL stats, Leetify data, role, CI.

### MapPoolInsights
**File:** `components/map-pool-insights.tsx` (~16KB)
**Used by:** [[Match Analysis]] (via `AnalysisDisplay`)
**Purpose:** Deep map analysis — win rates, sample sizes, confidence levels, veto suggestions.

---

## Chart Components

### RadarChart
**File:** `components/radar-chart.tsx`
**Used by:** [[Match Analysis]] (via `UpcomingMatchModules`)
**Purpose:** Matchup axes radar chart (6 axes: aim, positioning, utility, clutch, opening, entry).
**Library:** Recharts

### HeadToHeadBar
**File:** `components/head-to-head-bar.tsx`
**Used by:** [[Match Analysis]] (via `AnalysisDisplay`)
**Purpose:** Side-by-side horizontal comparison bar for two teams.

### TeamComparisonBars
**File:** `components/team-comparison-bars.tsx`
**Used by:** [[Match Analysis]] (via `AnalysisDisplay`)
**Purpose:** Multi-stat comparison bars (DPR, KAST, opening duels, etc.).

### PredictionCard
**File:** `components/prediction-card.tsx`
**Used by:** [[Match Analysis]]
**Purpose:** Win probability display — circular/gauge indicator with % and confidence note.

### EconomyFlow
**File:** `components/economy-flow.tsx`
**Used by:** [[Match Analysis]] (post-analysis section)
**Purpose:** Economy progression visualization across rounds.

---

## Utility Components

### IdentityBadge
**File:** `components/identity-badge.tsx`
**Used by:** All pages
**Exports:** `PlayerAvatar`, `TeamLogo`

Props:
- `tone`: `'home' | 'away' | 'neutral'` — colour ring around avatar
- `size`: `'xs' | 'sm' | 'md'`
- `src`: image URL (routed via `/api/bl-image` for BL-hosted images)

### UpcomingPreviewPanel
**File:** `components/upcoming-preview-panel.tsx`
**Used by:** [[Home]], [[Division Overview]]
**Purpose:** Abbreviated pre-match card showing team names, win probability estimate, top player per team.

### AnalysisSection
**File:** `components/analysis-section.tsx`
**Used by:** `AnalysisDisplay`
**Purpose:** Wrapper with consistent section heading and styling for analysis sub-sections.

---

## shadcn/ui Primitives (`components/ui/`)

| Component | File | Radix Primitive | Used For |
|-----------|------|-----------------|---------|
| `Badge` | `badge.tsx` | — | Status labels, role tags |
| `Card` | `card.tsx` | — | Content containers |
| `Chart` | `chart.tsx` | — | Recharts wrapper |
| `Progress` | `progress.tsx` | `@radix-ui/react-progress` | Stat bars |
| `Tooltip` | `tooltip.tsx` | `@radix-ui/react-tooltip` | Stat explanations |

---

## Component → Page Matrix

| Component | Home | Match | Player | Team | Division |
|-----------|------|-------|--------|------|----------|
| AnalysisDisplay | | ✅ | | | |
| UpcomingMatchModules | | ✅ | | | |
| PlayerProfileDisplay | | | ✅ | | |
| TeamProfileDisplay | | | | ✅ | |
| PlayerDetail | | ✅ | | | |
| MapPoolInsights | | ✅ | | | |
| RadarChart | | ✅ | | | |
| PredictionCard | | ✅ | | | |
| UpcomingPreviewPanel | ✅ | | | | ✅ |
| IdentityBadge | ✅ | ✅ | ✅ | ✅ | ✅ |
