# CS2 Data Analytics — Sopra Steria aSync

Analyse- og visualiseringsverktøy for CS2-kamper i [Bedriftsligaen](https://app.bedriftsligaen.no), bygget rundt en Next.js-app som kombinerer BL-data og Leetify-data for pre-match og post-match innsikt.

## Prosjektstruktur

- [cs2-app](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app): hovedapplikasjonen i Next.js
- `scripts/` og øvrige hjelpefiler: datainnhenting, gamle eksperimenter og støtteverktøy

For lokal utvikling og miljøvariabler, se [cs2-app/README.md](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/README.md).

## Datakilder

| Kilde | Hva | Bruk |
|-------|-----|------|
| **Bedriftsligaen API** | Matchstats per spiller: kills, deaths, KAST, DPR, opening duels, clutches, survival, trade | Kampkontekst og historisk BL-baseline |
| **Leetify API** | Aim, positioning, utility, opening, CT/T-opening split, matchmaking-historikk | Prior og formsignal, særlig for upcoming-kamper |

## Scoringsmodell

### Komposittscore

Intern spillerscore lagres som `0–1`, men vises normalt som `0–10` i UI.

```text
Score = 0.30 × DPR/100
      + 0.25 × KAST
      + 0.20 × Opening duel win rate
      + 0.15 × min(K/D / 2, 1.0)
      + 0.10 × HS rate
```

### Bayesiansk vekting

Ved upcoming-kamper blends BL-signalet med Leetify-prior:

```text
BL_weight = min(effective_rounds × 1.5 / (effective_rounds × 1.5 + 150), 0.75)
final_score = BL_weight × BL_score + (1 − BL_weight) × Leetify_prior
```

Det betyr at Leetify fungerer som prior, mens BL-data fungerer som kontekstnær evidens. BL kan aldri utgjøre mer enn 75 % alene.

### Rekency-vekting

| Kilde | Vekt |
|-------|------|
| Kvalifisering R1 | 0.5 |
| Kvalifisering R2 | 0.6 |
| Kvalifisering R3 | 0.7 |
| BL Runde 1 | 0.7 |
| BL Runde 2 | 1.0 |
| BL Runde 3 | 1.5 |

## Analyseflater

### Pre-match

- lineup-simulering
- map pool og veto-hint
- team comparison og spillerkort
- early-round og formmoduler

### Post-match

- resultatsammendrag og map story
- `Tactical Control` som fullbredde toppseksjon
- `Economy`, `Teamplay Control`, `Round Stability`, `Late-round Impact`, `Player Development` og `Coach Notes`
- `Player Development` bruker nå BL `R-rating` mot historisk BL-baseline når data finnes
- `Late-round Impact` viser per-lag verdier og edge, i stedet for bare en løs differanse

## API-notater

### Bedriftsligaen

```text
Base URL: https://app.bedriftsligaen.no/api/paradise/v2
Auth: Bearer <token>
```

Nyttige endepunkt:
- `GET /matchup?division_id={id}&limit=50`
- `GET /matchup/{id}/stats`
- `GET /competition/{id}/divisions`
- `GET /competition/{id}/signups?limit=200`
- `GET /user/{id}`

### Leetify

```text
Base URL: https://api-public.cs-prod.leetify.com
Auth: Bearer <token>
```

Nyttige data:
- `rating.aim`, `rating.positioning`, `rating.utility`
- `stats.ct_opening_duel_success_percentage`, `stats.t_opening_duel_success_percentage`
- `recent_matches[]`

Leetify rate-limiter aggressivt, så kall bør gjøres med forsiktighet.
