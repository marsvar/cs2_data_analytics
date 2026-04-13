---
tags: [overview, cs2, bedriftsligaen]
status: active
last_updated: 2026-04-07
---

# CS2 Analytics — App Overview

A Next.js 16 analytics platform for Bedriftsligaen CS2 (Norwegian corporate league) that combines Bedriftsligaen API data with Leetify profiles to produce Bayesian-weighted player ratings, tactical match breakdowns, and win probability estimates.

---

## Navigation

### Pages
- [[Home]] — Search, division selector, recent matches
- [[Match Analysis]] — Full pre/post match tactical breakdown
- [[Player Profile]] — Individual player stats & trends
- [[Team Profile]] — Roster, map pool, composition
- [[Division Overview]] — Standings, upcoming matches

### Architecture
- [[API Routes]] — All 8 backend endpoints
- [[Services]] — Business logic in `lib/`
- [[Components]] — Shared UI components
- [[Data Flow]] — How data moves through the app
- [[Tech Stack]] — Framework, libraries, design tokens

---

## Feature Status by Page

| Page | Route | Status | Key Gap |
|------|-------|--------|---------|
| [[Home]] | `/` | ✅ | — |
| [[Match Analysis]] | `/match/[id]` | ✅ | Live score polling |
| [[Player Profile]] | `/player/[id]` | ✅ | No chart for trend history |
| [[Team Profile]] | `/team/[id]` | ✅ | No head-to-head history |
| [[Division Overview]] | `/division/[id]` | ✅ | Standings tiebreaker logic unclear |

Legend: ✅ implemented · 🚧 partial · ❌ missing

---

## Feature Checklist (Cross-App)

### Core Features
- [x] Match analysis with Bayesian player scoring
- [x] Win probability (pre-match)
- [x] Tactical edge breakdown (opening duels, trade structure, survival, entry pressure, map leverage)
- [x] Post-match tactical review
- [x] Player role detection (ENTRY / AWP / SUPP / FRAG / ANCH)
- [x] Map pool analysis + veto hints
- [x] Leetify data integration (aim, positioning, utility, clutch, opening duels)
- [x] 90% confidence intervals on all score estimates
- [x] Watchlist (initiators, form players, risk players)
- [x] Division standings with points
- [x] Upcoming match quick preview

### In Progress / Missing
- [ ] Live match polling / score updates
- [ ] Player trend chart visualization (currently text-only)
- [ ] Head-to-head team history
- [ ] Demo (.dem) parsing for positional data
- [ ] Standings tiebreaker rule documentation
- [ ] Search result pagination
- [ ] Mobile-optimised layout audit

---

## Coherence Issues

| Issue | Pages Affected | Notes |
|-------|---------------|-------|
| Division ID passed via URL param vs path | [[Home]], [[Division Overview]] | Home uses `?division=` query param; Division page uses `/division/[id]` path — both work but inconsistent |
| Player identity resolution | [[Match Analysis]], [[Player Profile]] | BL `paradise_user_id` links to Leetify via `players.ts` static map — any player not in the map gets no Leetify data |
| Cache TTL mismatch | [[Match Analysis]], [[Division Overview]] | Division matches cache 2 min; analyze result caches 5 min — a just-completed match may show stale status |
| `force-dynamic` everywhere | All pages | All pages opt out of static generation; no ISR in use |
| No loading skeletons | [[Player Profile]], [[Team Profile]] | These pages have no streaming/suspense — full page blocks on API response |

---

## External Dependencies

| Service | Base URL | Auth | Rate Limit |
|---------|----------|------|------------|
| Bedriftsligaen API | `https://app.bedriftsligaen.no/api/paradise/v2` | Bearer token | Unknown |
| Leetify | `https://api-public.cs-prod.leetify.com` | Bearer token | ~5 req/min |
