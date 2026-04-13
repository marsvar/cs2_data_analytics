---
tags: [page, cs2]
status: active
last_updated: 2026-04-07
---

# Division Overview Page

**Route:** `/division/[id]`
**File:** `app/division/[id]/page.tsx`
**Purpose:** League standings for a division and a list of upcoming matches with quick tactical previews.

---

## Features

### Implemented ✅
- [x] Standings table built from completed matches (points, wins, losses)
- [x] Upcoming matches section with match cards
- [x] Recent round results list
- [x] Quick tactical preview panel per upcoming match (`UpcomingPreviewPanel`)
- [x] Team logos in standings and match cards
- [x] Links to full match analysis for each match
- [x] Links to team profiles from standings

### Partial 🚧
- [ ] Standings tiebreaker logic — currently sorted by points → wins → losses, but BL tiebreaker rules (round difference, head-to-head) are not fully implemented

### Missing ❌
- [ ] "All rounds" history pagination — only the most recent round is shown
- [ ] Division switcher within the page (must go back to [[Home]] to change division)
- [ ] Playoff bracket view (if division has playoffs)
- [ ] Auto-refresh for in-progress round

---

## API Calls

| Endpoint | Query Param | Purpose |
|----------|-------------|---------|
| `/api/division` | `division=[id]` | All matches in division (completed + upcoming), normalised |
| `/api/upcoming-preview` | `matchup_id=[id]` | Quick tactical preview per upcoming match |

`upcoming-preview` is fetched per-match on the page — could be slow with many upcoming matches. Consider batching or lazy-loading.

---

## Components Used

- `UpcomingPreviewPanel` — abbreviated pre-match card → [[Components#UpcomingPreviewPanel]]
- `IdentityBadge` (`TeamLogo`) → [[Components#IdentityBadge]]
- shadcn `Badge` for round status

---

## Data Shape

Consumes `DivisionResponse` from [[Services#division-service]]:
```ts
{
  matches: MatchSummary[],  // all matches, indexed by matchup_id
  division_id: number,
  division_name: string,
}
```

Standings are derived client-side by iterating `matches` and accumulating points per team (3 pts win, 0 pts loss, currently no draw handling).

---

## Navigation

- ← [[Home]] (back button / division selector)
- → [[Match Analysis]] (click any match card)
- → [[Team Profile]] (click team name in standings)

---

## Coherence Notes

- The `DivisionService` caches for 2 min, but `analyze-service` caches for 5 min. A match that just finished may show as "Kommende" on this page while the match page already has post-analysis — 3 min window of inconsistency.
- `UpcomingPreviewPanel` fires `/api/upcoming-preview` for each upcoming match sequentially on mount — with 6+ upcoming matches this can cause a waterfall of requests. Worth considering a Promise.all or lazy expansion.
- Division ID used here as a path param (`/division/[id]`), but [[Home]] stores it as a query param (`?division=`). They refer to the same ID — just different URL patterns for different contexts.
