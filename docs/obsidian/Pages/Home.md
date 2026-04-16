---
tags: [page, cs2]
status: active
last_updated: 2026-04-07
---

# Home Page

**Route:** `/`
**File:** `app/page.tsx`
**Purpose:** Main entry point — search for matches, browse by division, navigate to analysis pages.

---

## Features

### Implemented ✅
- [x] Division selector dropdown (persists via `?division=` URL param)
- [x] Recent matches panel split into "Kommende" (upcoming) and "Forrige runde" (last round)
- [x] Match search typeahead — queries `/api/match-search?q=...`
- [x] Status badges per match (Kommende / Spilt)
- [x] Match cards linking to `/match/[id]`
- [x] Team logo display via `[[Components#IdentityBadge|IdentityBadge]]`
- [x] Score display on completed matches

### Partial 🚧
- [ ] Live match status badge — currently no "Live" state shown even if a match is in progress

### Missing ❌
- [ ] Search result pagination (currently limited by `?limit=` on API)
- [ ] Mobile layout audit — grid may overflow on small screens
- [ ] Empty state when no matches are found in a division

---

## API Calls

| Endpoint | When | Purpose |
|----------|------|---------|
| `/api/divisions` | On load | Populate division selector |
| `/api/division?division=[id]` | On division select | Fetch matches for that division |
| `/api/match-search?q=[q]&division=[id]` | On search input | Typeahead results |

---

## Components Used

- `UpcomingPreviewPanel` — quick preview card for upcoming matches → [[Components#UpcomingPreviewPanel]]
- `IdentityBadge` (`TeamLogo`, `PlayerAvatar`) → [[Components#IdentityBadge]]
- shadcn `Badge` for status labels

---

## Navigation Targets

- → [[Match Analysis]] (`/match/[id]`)
- → [[Division Overview]] (`/division/[id]`)

---

## Coherence Notes

- The division ID is stored in URL as `?division=` query param here, but the Division Overview page uses a path param `/division/[id]`. Both are consistent — Home reads the query param to pre-select the dropdown on back-navigation.
- Match search returns results across all divisions unless `?division=` is passed — confirm this is the desired UX.
