# CLAUDE.md — CS2 Data Analytics

Dette prosjektet analyserer CS2-kamper i Bedriftsligaen ved å kombinere data fra Bedriftsligaen-APIet og Leetify.

## Prosjektmål

Lage et verktøy hvor man kan slå opp en kamp (matchup-ID eller lag-navn) og automatisk få en analyse tilsvarende `match-analysis.html` — med power-ranking, konfidensintervall, Bayesiansk vekting og taktiske innsikter.

## Autentisering

API-nøkler lagres **ikke** i kodebasen. Hent dem fra miljøvariabler:

```bash
BL_TOKEN="..."         # Bedriftsligaen Bearer token
LEETIFY_TOKEN="..."    # Leetify API key
```

Nåværende tokens (kun for utvikling — byttes ut):
- BL: `21|ml9Doz9I7ZjeHwFKafbsUz3kbZx2s8fzMaYGyFNP78e0af8f`
- Leetify: `460fc840-d1c3-40cd-ab92-88fde12fd831`

## API-endepunkt

### Bedriftsligaen
```
Base: https://app.bedriftsligaen.no/api/paradise/v2
Auth: Authorization: Bearer {BL_TOKEN}
```

| Endepunkt | Beskrivelse |
|-----------|-------------|
| `GET /competition/{id}/divisions` | Alle divisjoner i en sesong |
| `GET /competition/{id}/signups?limit=200` | Alle lag i en sesong |
| `GET /matchup?division_id={id}&limit=50` | Alle kamper i en divisjon |
| `GET /matchup/{id}/stats` | Spillerstatistikk for én kamp (brukes mest) |
| `GET /user/{id}` | Brukerprofil inkl. Steam-kontoer |

### Leetify
```
Base: https://api-public.cs-prod.leetify.com
Auth: Authorization: Bearer {LEETIFY_TOKEN}
```

| Endepunkt | Beskrivelse |
|-----------|-------------|
| `GET /v3/profile?steam64_id={steam64_id}` | Full spillerprofil med ratings og stats |

**Rate limit:** ~5 req/min. Bruk `time.sleep(3)` mellom kall.

## Kjent kontekst — Vår 2026

```python
COMPETITION_ID = 1220          # "Bedriftsligaen i CS2 — Vår 2026"
ASYNC_DIVISION_ID = 1138       # "2. divisjon avd. A" (BL-sesongen)
ASYNC_QUAL_DIVISION_ID = 1031  # "2. Divisjon" (kvalifisering)
ASYNC_TEAM_ID = 21374
NAS_TEAM_ID = 23104
NAS_QUAL_DIVISION_ID = 1040
```

### aSync-spillere (paradise_user_id → Steam64)
```python
ASYNC_PLAYERS = {
    18841: {"name": "t0bben"},
    14695: {"name": "Ev1"},
    1888:  {"name": "m4rc",       "steam": "76561198258030105"},
    5439:  {"name": "FlyySoHigh", "steam": "76561198012553562"},
    15014: {"name": "Mindseth",   "steam": "76561197985807777"},
    9924:  {"name": "m0rr0w",     "steam": "76561198005571808"},
    11904: {"name": "MikaeliX"},
    # Laserturken: ingen BL-data — kun Leetify
}
LASERTURKEN_STEAM = "76561198098169439"
```

### NAS-spillere
```python
NAS_PLAYERS = {
    16542: {"name": "Hcon",             "steam": "76561198167341329"},
    16879: {"name": "taghg",            "steam": "76561198993717949"},
    15446: {"name": "vegg",             "steam": "76561197965657989"},
    18793: {"name": "Walbern",          "steam": "76561198050639756"},
    18797: {"name": "MuffinToks",       "steam": "76561199495515753"},
    15450: {"name": "NUMERO ZINCO",     "steam": "76561197965471361"},
    18786: {"name": "Flipz",            "steam": "76561199004942491"},
    18967: {"name": "Satoo",            "steam": "76561198379230401"},
}
```

## Scoringsmodell

Se `docs/methodology.md` for full forklaring. Kort oppsummert:

```python
def composite_score(dpr, kast, od_rate, kd, hs):
    return (0.30 * dpr/100 +
            0.25 * kast +
            0.20 * od_rate +
            0.15 * min(kd/2, 1.0) +
            0.10 * hs)

def bl_weight(effective_rounds):
    return min(effective_rounds * 1.5 / (effective_rounds * 1.5 + 150), 0.75)
```

Kampers rekency-vekting:
- Kvalifisering R1: 0.5, R2: 0.6, R3: 0.7
- BL R1: 0.7, R2: 1.0, R3: 1.5

## Viktige funn fra analyse

- Opening duel win% er den sterkeste enkelt-prediktoren for rundeseier (70–80% av runder vunnet av første kill)
- ADR/DPR er mer stabilt enn K/D ved få runder (stabiliserer ved ~150 runder vs ~400 for K/D)
- Med under 100 runder per spiller er 90% CI typisk ±0.8–1.0 — ikke stol blindt på punktestimater
- Leetify CT/T-split: `stats.ct_opening_duel_success_percentage` / `stats.t_opening_duel_success_percentage`
- Leetify `rating.aim/positioning/utility` er percentiler (0–100); `rating.clutch/opening` er råverdier

## Neste steg

1. **Backend**: Python Flask/FastAPI eller Node Express som eksponerer `/api/analyze?matchup_id=X`
2. **Frontend**: Søkegrensesnitt med auto-fetch fra BL API
3. **Database**: Lagre aggregerte stats per spiller for raskere oppslag
4. **Demo-parsing**: `awpy` Python-bibliotek for `.dem`-filer (posisjonell data, CT/T per runde)

## Kjøre utviklingsserveren

```bash
python -m http.server 3000
# Åpne http://localhost:3000/match-analysis.html
```

Eller via `.claude/launch.json` i Claude Code.
