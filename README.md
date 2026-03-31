# CS2 Data Analytics — Sopra Steria aSync

Analyse- og visualiseringsverktøy for CS2-kamper i [Bedriftsligaen](https://app.bedriftsligaen.no), med støtte for datainnhenting fra Bedriftsligaen-APIet og Leetify.

---

## Hva er dette?

Et verktøy som kombinerer data fra to kilder for å analysere kampprestasjoner:

| Kilde | Hva | Bruk |
|-------|-----|------|
| **Bedriftsligaen API** | Matchstats per spiller: kills, deaths, KAST, DPR, opening duels, clutches | Kontekst-spesifikke data fra BL-kamper |
| **Leetify API** | Percentile-ratings (aim, positioning, utility, clutch, opening), CT/T-side split | Statistisk prior fra lang matchmaking-historikk |

---

## Metodikk

### Sammensatt score (0–10)
```
Score = 0.30 × DPR/100
      + 0.25 × KAST%
      + 0.20 × Opening duel win%
      + 0.15 × min(K/D / 2, 1.0)
      + 0.10 × HS%
```

### Bayesiansk vekting (BL vs Leetify)
```
BL_weight = min(effective_rounds × 1.5 / (effective_rounds × 1.5 + 150), 0.75)
posterior  = BL_weight × BL_stat + (1 − BL_weight) × Leetify_prior
```
Leetify fungerer som *prior belief* (hva vi forventer fra lang historikk), mens BL-data er *evidens* fra rett kontekstnivå. Vekten capper på 75 % — aldri rent BL.

### Rekency-vekting
| Kilde | Vekt |
|-------|------|
| Kvalifisering R1 | 0.5 |
| Kvalifisering R2 | 0.6 |
| Kvalifisering R3 | 0.7 |
| BL Runde 1 | 0.7 |
| BL Runde 2 | 1.0 |
| BL Runde 3 | 1.5 |

### Konfidensintervall (90 %)
Bootstrapped CI basert på rundeutvalg per metrikk. Typisk ±0.70–0.90 med 150+ runder; ±1.0–1.5 med under 80 runder.

---

## Nåværende innhold

### `match-analysis.html`
Statisk HTML-rapport for **Runde 4 · aSync vs NAS — Boarding Group A** (29. mars 2026).

Inneholder:
- Power-ranking med konfidensintervall-visualisering for alle 8+8 spillere
- Bayesiansk kombinert score (BL + Leetify) med rundekilde-badges
- CT vs T-side opening duel split (Leetify, 5 aSync-spillere)
- Full spillertabell med 6 kamper per lag (3 kvalifisering + 3 BL)
- Lag-sammenligningsbars og radar-chart (Chart.js)
- Taktiske innsikter basert på aggregerte data

Åpnes direkte i nettleser, eller med `.claude/launch.json`-konfigurasjonen (Python HTTP-server, port 3000).

---

## API-info

### Bedriftsligaen
```
Base URL:  https://app.bedriftsligaen.no/api/paradise/v2
Auth:      Bearer <token>

Nyttige endepunkt:
  GET /matchup?division_id={id}&limit=50          # Alle matchups i en divisjon
  GET /matchup/{id}/stats                         # Spillerstatistikk for en kamp
  GET /competition/{id}/divisions                 # Alle divisjoner i en sesong
  GET /competition/{id}/signups?limit=200         # Lag påmeldt en sesong
  GET /user/{id}                                  # Spillerprofil inkl. Steam ID
```

Nøkkeldata per spiller per matchup:
`kills`, `deaths`, `kd_ratio`, `kast_ratio`, `damage_per_round`, `headshot_ratio`,
`opening_duels_won`, `opening_duels_lost`, `firstkills`, `clutches_won`, `trade_kills`,
`rounds_played`, `survival_ratio`

### Leetify
```
Base URL:  https://api-public.cs-prod.leetify.com
Auth:      Bearer <token>

  GET /v3/profile?steam64_id={steam64_id}    # Spillerprofil med ratings og stats
```

Nøkkeldata:
- `rating.aim`, `rating.positioning`, `rating.utility` — percentiler (0–100)
- `stats.ct_opening_duel_success_percentage`, `stats.t_opening_duel_success_percentage`
- `recent_matches[]` — siste kamper med leetify_rating, reaction_time_ms, osv.

**NB:** Leetify rate-limiter aggressivt (~5 req/min uten registered app key). Bruk `sleep 3` mellom kall.

---

## Kjent kontekst (Vår 2026)

| | Verdi |
|---|---|
| Sesong | Bedriftsligaen i CS2 — Vår 2026 |
| Competition ID | 1220 |
| Divisjon (aSync) | 1138 — 2. divisjon avd. A |
| Kvalifisering (aSync) | 1031 — 2. Divisjon |
| Team ID (aSync) | 21374 |
| Team ID (NAS) | 23104 |

---

## Neste steg

- [ ] Backend (Node/Python) som gjør live API-oppslag per kamp-ID
- [ ] Søkegrensesnitt: slå opp en kamp og få analyse automatisk
- [ ] Lagre historikk og bygge opp databasen over tid
- [ ] Demo-parsing (`.dem`-filer via `awpy`) for posisjonell data og CT/T-split direkte fra BL
- [ ] ELO-justert vekting (stats mot sterke lag teller mer)
- [ ] Automatisk oppdatering av `match-analysis.html` før hver kamprunde
