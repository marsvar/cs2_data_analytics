# cs2-app

Next.js-applikasjonen for CS2-analyse. Appen støtter både upcoming-match analyse og post-match etteranalyse basert på Bedriftsligaen-data og Leetify-data.

## Kom i gang

Kjør utviklingsserveren:

```bash
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000).

Nyttige kommandoer:

```bash
npx tsc --noEmit
npm run build
```

## Miljøvariabler

Sett disse i `.env.local`:

```bash
BL_TOKEN=...
LEETIFY_TOKEN=...
CS2_ACTIVE_DUTY_MAPS=de_anubis,de_ancient,de_dust2,de_inferno,de_mirage,de_nuke,de_overpass
```

`CS2_ACTIVE_DUTY_MAPS` brukes av map/veto-analysen.

Notater:
- kommaseparert liste
- støtter både canonical names (`de_mirage`) og aliaser (`mirage`, `dust2`)
- hvis variabelen mangler eller er ugyldig, brukes standard pool

## Viktige konsepter

### Intern score

`player.score` er appens komposittscore på `0–1`, men skal vises som `0–10` i UI.

Formel:

```text
0.30 × DPR/100
+ 0.25 × KAST
+ 0.20 × Opening duel win rate
+ 0.15 × min(K/D / 2, 1.0)
+ 0.10 × HS rate
```

Ved upcoming-kamper kan scoren blandes med Leetify-prior avhengig av hvor mye BL-data vi har.

### Post-match analyse

Post-match-visningen inneholder:
- `Tactical Control`
- `Economy`
- `Teamplay Control`
- `Round Stability`
- `Late-round Impact`
- `Player Development`
- `Coach Notes`

Notater:
- `Tactical Control` er fullbredde øverst
- de øvrige kortene bruker kolonne-layout for tettere pakking
- `Late-round Impact` viser både per-lag verdi og edge
- `Player Development` bruker BL `R-rating` mot historisk BL-baseline når det er tilgjengelig

### R-rating vs score

Det finnes nå to ulike signaler i appen:
- `Score /10`: intern komposittscore brukt for rangering og lagstyrke
- `R-rating`: råverdi fra BL API, brukt i post-match spillerutvikling når historisk BL-baseline finnes

`R-rating` skal ikke vises som en kunstig prosent eller `0–100`.

## Filområder

- [app](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/app): routes og sider
- [components](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/components): UI-komponenter
- [lib/analyze-service.ts](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/lib/analyze-service.ts): hovedpipeline for analyse
- [lib/post-analysis.ts](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/lib/post-analysis.ts): etteranalyse og tekst/copy
- [lib/aggregation.ts](/Users/msvarlia/Developer/cs2_analytics/cs2_data_analytics/cs2-app/lib/aggregation.ts): scoringsmodell
