---
tags: [architecture, api, cs2]
status: active
last_updated: 2026-04-07
---

# API Routes

All routes live under `app/api/`. Every route uses `force-dynamic` — no static generation or ISR.

---

## Route Reference

| Route | Method | File | Purpose | Key Query Params |
|-------|--------|------|---------|-----------------|
| `/api/analyze` | GET | `app/api/analyze/route.ts` | Core match analysis engine | `matchup_id` |
| `/api/divisions` | GET | `app/api/divisions/route.ts` | List all divisions in competition | `competition_id` (opt) |
| `/api/division` | GET | `app/api/division/route.ts` | Matches + metadata for one division | `division`, `division_id` |
| `/api/match-search` | GET | `app/api/match-search/route.ts` | Search matches by team names | `q`, `division` (opt), `limit` (opt) |
| `/api/player` | GET | `app/api/player/route.ts` | Full player profile | `user_id` |
| `/api/team` | GET | `app/api/team/route.ts` | Full team profile | `team_id` |
| `/api/upcoming-preview` | GET | `app/api/upcoming-preview/route.ts` | Abbreviated preview for upcoming match | `matchup_id` |
| `/api/bl-image` | GET | `app/api/bl-image/route.ts` | Image proxy for BL-hosted images | `url` |

---

## Cache TTL Strategy

Caching is in-memory (per serverless instance) via the BL API client in [[Services#bl-api]].

| Data Type | TTL | Notes |
|-----------|-----|-------|
| Analyze result | 5 min | Keyed by `matchup_id` |
| Match stats (`/matchup/[id]/stats`) | 5 min | |
| Division matchups | 2 min | Frequently changing (round results) |
| Team players (roster) | 15 min | Rosters change rarely |
| User profiles | 6 hours | Stable BL profile data |
| Competition / signups | 30 min | Season-level data |
| Upcoming preview | ~5 min | Inherited from analyze cache |

**Inflight deduplication:** `bl-api.ts` tracks in-flight requests and queues duplicate calls for the same endpoint until the first resolves — prevents thundering herd on simultaneous page loads.

---

## Max Duration (Serverless Timeout)

| Route | Max Duration |
|-------|-------------|
| `/api/analyze` | 90s |
| `/api/team` | 90s |
| `/api/player` | 60s |
| `/api/upcoming-preview` | 60s |
| `/api/bl-image` | 30s |
| Others | Default (10s) |

---

## Error Handling

All routes use custom error classes and return structured JSON errors:

| Error Class | HTTP Status | Route |
|-------------|-------------|-------|
| `AnalyzeServiceError` | 400 / 404 / 500 | `/api/analyze` |
| `DivisionServiceError` | 400 / 500 | `/api/division` |
| `PlayerProfileError` | 400 / 404 / 500 | `/api/player` |
| `TeamProfileError` | 400 / 404 / 500 | `/api/team` |
| `MatchSearchServiceError` | 400 / 500 | `/api/match-search` |

---

## Which Pages Call Which Routes

| Page | Routes Used |
|------|------------|
| [[Home]] | `/api/divisions`, `/api/division`, `/api/match-search` |
| [[Match Analysis]] | `/api/analyze` |
| [[Player Profile]] | `/api/player` |
| [[Team Profile]] | `/api/team` |
| [[Division Overview]] | `/api/division`, `/api/upcoming-preview` |
