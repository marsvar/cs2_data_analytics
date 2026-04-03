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

## Sesongkontekst

Hent gjeldende sesong-IDs fra BL APIet og konfigurer i `.env.local` eller som miljøvariabler:

```bash
COMPETITION_ID=...        # Sesong-ID fra /competition
DIVISION_ID=...           # Divisjons-ID (BL-sesongen)
QUAL_DIVISION_ID=...      # Divisjons-ID (kvalifisering, valgfritt)
```

### Spillere (paradise_user_id → Steam64)

Bygg opp spillerlisten dynamisk ved å hente lag fra `/competition/{id}/signups` og brukerprofiler fra `/user/{id}`. Spillere uten BL-konto kan knyttes til Leetify via Steam64-ID direkte.

```python
PLAYERS = {
    # paradise_user_id: {"name": "...", "steam": "steam64_id"}
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
