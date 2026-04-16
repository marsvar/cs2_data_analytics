---
tags: [page, cs2]
status: active
last_updated: 2026-04-07
---

# Team Profile Page

**Route:** `/team/[id]`
**File:** `app/team/[id]/page.tsx`
**Purpose:** Team composition overview — roster with roles, map pool, match history, playstyle summary.

---

## Features

### Implemented ✅
- [x] Team logo and name
- [x] Roster display with role badge per player
- [x] Role distribution summary (how many ENTRY/AWP/SUPP/etc.)
- [x] Team map pool: win rates per map with sample size confidence
- [x] Match history (recent results)
- [x] Economy notes (derived from match history patterns)
- [x] Composition notes (auto-generated playstyle summary)
- [x] Links to player profiles for each roster member

### Partial 🚧
- [ ] Map pool confidence shown but not visually differentiated (low/med/high look the same)

### Missing ❌
- [ ] Head-to-head history against other teams
- [ ] Team score trend over time (win streak, recent form)
- [ ] Loading skeleton — page blocks on full API response
- [ ] Substitution / roster change tracking

---

## API Calls

| Endpoint | Query Param | Purpose |
|----------|-------------|---------|
| `/api/team` | `team_id=[id]` | Full team profile — roster, map pool, history, playstyle |

---

## Components Used

- `TeamProfileDisplay` — team overview (16KB) → [[Components#TeamProfileDisplay]]
- `IdentityBadge` (`TeamLogo`, `PlayerAvatar`) → [[Components#IdentityBadge]]

---

## Data Shape

Consumes `TeamProfileResponse` from [[Services#team-profile-service]]:
```ts
{
  team: { id, name, logo },
  players: PlayerSummary[],       // role, name, id, avatar
  role_distribution: RoleCounts,
  map_pool: MapPoolEntry[],       // map, win_rate, matches, confidence
  match_history: MatchSummary[],
  economy_notes: string,
  composition_notes: string,
}
```

---

## Navigation

- → [[Player Profile]] (click any roster player)
- ← [[Match Analysis]] (team name link in analysis header)
- ← [[Division Overview]] (team name links in standings)

---

## Coherence Notes

- Roster is fetched live from `/api/team` → [[Services#team-profile-service]] → BL API `getTeamPlayers()`. If a player has left the team in BL but not been updated, they may still appear here.
- Role detection per player uses [[Services#detect-role]] — same logic as Player Profile and Match Analysis, so roles should be consistent across pages.
- Map pool win rates use `minMatches=8` threshold for veto hints (same as Match Analysis map pool) — teams with fewer maps played will show no veto recommendation.
