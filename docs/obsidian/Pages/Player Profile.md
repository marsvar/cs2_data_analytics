---
tags: [page, cs2]
status: active
last_updated: 2026-04-07
---

# Player Profile Page

**Route:** `/player/[id]`
**File:** `app/player/[id]/page.tsx`
**Purpose:** Individual player statistics, role, performance trends, and Leetify data.

---

## Features

### Implemented ✅
- [x] Player avatar and name
- [x] Role badge (ENTRY / AWP / SUPP / FRAG / ANCH) with confidence level
- [x] Composite score (0–1 scale) with 90% CI
- [x] Trend analysis: last 5, 10, 20 matches (K/D, KAST, DPR, HS%)
- [x] Map records — win rate + stats per map
- [x] Multi-kill stats (2K, 3K, 4K, 5K)
- [x] Clutch win rates (1v1, 1v2, 1v3)
- [x] Leetify data: aim %, positioning %, utility %, clutch rating, opening duel %
- [x] CT / T side split for opening duel success
- [x] Flash assist rate, utility damage
- [x] Link to most recent analyzed match
- [x] Link to team profile

### Partial 🚧
- [ ] Trend data displayed as text/numbers only — no sparkline or chart visualization

### Missing ❌
- [ ] Round count per map (sample size indicator in map records)
- [ ] Career totals vs recent form comparison (currently only recent window shown)
- [ ] Loading skeleton — page blocks until full API response

---

## API Calls

| Endpoint | Query Param | Purpose |
|----------|-------------|---------|
| `/api/player` | `user_id=[id]` | Full player profile — BL stats, Leetify, role, trends |

---

## Components Used

- `PlayerProfileDisplay` — full stat sheet (22KB) → [[Components#PlayerProfileDisplay]]
- `IdentityBadge` (`PlayerAvatar`) → [[Components#IdentityBadge]]

---

## Data Shape

Consumes `PlayerProfileResponse` from [[Services#player-profile-service]]:
```ts
{
  player: { id, name, avatar, steam64 },
  role: { role, confidence },
  score: { value, ci90 },
  leetify: { aim, positioning, utility, clutch, opening_duel_ct, opening_duel_t },
  trends: { last5, last10, last20 },
  maps: MapRecord[],
  multi_kills: { k2, k3, k4, k5 },
  clutches: { v1, v2, v3 },
  last_match_id?: number,
  team_id?: number,
}
```

---

## Navigation

- ← [[Match Analysis]] (contextual back link via `?from=match`)
- → [[Team Profile]] (link to player's team)

---

## Coherence Notes

- Player is looked up by `paradise_user_id`. If the player has no Leetify mapping in `players.ts`, Leetify fields will be absent — the UI should degrade gracefully (shows "N/A"), but confirm this is handled in `PlayerProfileDisplay`.
- The `role` is re-detected fresh on each page load from [[Services#detect-role]] — it may differ slightly from the role shown in `PlayerDetail` inside a match analysis if the match used older data.
- Trend windows (5/10/20) are over the most recent N *matches*, not N *rounds* — low-round matches weigh equally. Consider surfacing per-trend round count.
