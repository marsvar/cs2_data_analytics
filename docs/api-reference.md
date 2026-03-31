# API-referanse

## Bedriftsligaen

```
Base URL:  https://app.bedriftsligaen.no/api/paradise/v2
Auth:      Authorization: Bearer {BL_TOKEN}
```

### Nyttige endepunkt

#### Sesonger og divisjoner
```http
GET /competition?limit=100&game_id=1
GET /competition/{id}
GET /competition/{id}/divisions
GET /competition/{id}/signups?limit=200
```

#### Matchups
```http
GET /matchup?division_id={id}&limit=100
GET /matchup?paradise_user_id={id}&limit=100    # OBS: blander historiske IDer fra andre ligaer
GET /matchup/{id}/stats                          # ← Primær datakilde
```

#### Lag og spillere
```http
GET /team/{id}
GET /user/{id}                                   # Inkluderer Steam/FACEIT-kontoer
```

### Matchup stats — feltbeskrivelse

Per spiller i `/matchup/{id}/stats`:

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `paradise_user_id` | int | Unik spiller-ID i BL-systemet |
| `player_name` | str | Spillernavn |
| `maps_played` | int | Antall kart spilt i matchen |
| `rounds_played` | int | Totale runder |
| `rounds_won` | int | Runder vunnet |
| `kills` | int | Totale kills |
| `kills_per_round` | str | Kills/runde |
| `deaths` | int | Totale deaths |
| `kd_ratio` | str | K/D |
| `assists` | int | Assists |
| `headshots` | int | Headshot kills |
| `headshot_ratio` | str | HS% |
| `damage_per_round` | str | ADR (average damage per round) |
| `kast_ratio` | str | KAST-rate (0.0–1.0) |
| `survival_ratio` | str | Overlevelsesrate |
| `opening_duels_won` | int | Opening duels vunnet |
| `opening_duels_lost` | int | Opening duels tapt |
| `opening_duel_win_ratio` | str | OD win% |
| `firstkills` | int | Antall first kills |
| `clutches_won` | int | Clutches vunnet |
| `trade_kills` | int | Trade kills |
| `traded_deaths` | int | Traded deaths |
| `won_1v1` … `won_1v5` | int | 1vX clutch-seire per type |
| `rating` | str | BL intern rating |
| `side` | str | `"home"` eller `"away"` |

### Kjent sesong-struktur (Vår 2026)

```
Competition 1220: "Bedriftsligaen i CS2 — Vår 2026"
├── Division 1031: "2. Divisjon" (qualifier, status: finished)
│   └── Matchup-IDer for aSync: 15165 (R1), 15269 (R2), 15319 (R3)
├── Division 1040: "..." (NAS qualifier, status: finished)
│   └── Matchup-IDer for NAS: 15398 (R1), 15530 (R2), 15705 (R3)
└── Division 1138: "2. divisjon avd. A" (BL-sesongen, status: started)
    ├── aSync matchup-IDer: 15810 (R1), 15817 (R2), 15831 (R3)
    │   [15846 R4 vs NAS — ikke spilt ennå per 29.03.2026]
    └── NAS matchup-IDer: 15811 (R1), 15824 (R2), 15835 (R3)
```

---

## Leetify

```
Base URL:  https://api-public.cs-prod.leetify.com
Auth:      Authorization: Bearer {LEETIFY_TOKEN}
Rate:      ~5 req/min uten registrert app
```

### Endepunkt

```http
GET /v3/profile?steam64_id={steam64_id}
```

### Spillerprofil — feltbeskrivelse

#### `rating` (percentiler 0–100)
| Felt | Beskrivelse |
|------|-------------|
| `aim` | Aim-percentil vs. Leetify-base (typisk Premier Silver/Gold) |
| `positioning` | Posisjoneringsvurdering |
| `utility` | Utility-bruk (flash, smoke, HE effectiveness) |
| `clutch` | Råverdi (ikke percentil) — typisk range -0.1 til +0.2 |
| `opening` | Råverdi — opening duel impact |
| `ct_leetify` | CT-side leetify rating (råverdi) |
| `t_leetify` | T-side leetify rating (råverdi) |

#### `stats` (aggregerte gjennomsnitt)
| Felt | Beskrivelse |
|------|-------------|
| `ct_opening_duel_success_percentage` | CT-side OD win% — direkte brukbar |
| `t_opening_duel_success_percentage` | T-side OD win% — direkte brukbar |
| `ct_opening_aggression_success_rate` | CT aktiv vs. passiv OD rate |
| `t_opening_aggression_success_rate` | T aktiv vs. passiv OD rate |
| `accuracy_head` | Headshot accuracy |
| `accuracy_enemy_spotted` | Hit% når fiende er spotted |
| `reaction_time_ms` | Reaksjonstid i millisekunder |
| `spray_accuracy` | Nøyaktighet under spray |
| `flashbang_leading_to_kill` | Flash-assist rate |
| `he_foes_damage_avg` | Gjennomsnittlig HE-skade på fiender |

#### `recent_matches[]`
| Felt | Beskrivelse |
|------|-------------|
| `finished_at` | ISO 8601 tidsstempel |
| `data_source` | `"matchmaking"`, `"faceit"`, etc. |
| `outcome` | `"win"` / `"loss"` / `"tie"` |
| `map_name` | Kartnavn (f.eks. `"de_mirage"`) |
| `leetify_rating` | Kamprating (råverdi) |
| `score` | `[egne, motstandere]` |
| `reaction_time_ms` | Reaksjonstid denne kampen |
| `accuracy_enemy_spotted` | Hit% denne kampen |

### Kjente Steam64-IDer

#### Sopra Steria aSync
| Spiller | Steam64 |
|---------|---------|
| Mindseth | 76561197985807777 |
| m0rr0w | 76561198005571808 |
| FlyySoHigh | 76561198012553562 |
| Laserturken | 76561198098169439 |
| m4rc | 76561198258030105 |

#### NAS — Boarding Group A
| Spiller | Steam64 |
|---------|---------|
| NUMERO ZINCO | 76561197965471361 |
| vegg | 76561197965657989 |
| Walbern | 76561198050639756 |
| Satoo | 76561198379230401 |
| Hcon | 76561198167341329 |
| Flipz ツ | 76561199004942491 |
| taghg | 76561198993717949 |
| MuffinToks | 76561199495515753 |
