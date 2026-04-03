# Metodikk — Statistisk grunnlag

## Scoringsformel

### Sammensatt score (0–10 skala)

```
score = 10 × (0.30 × DPR/100 + 0.25 × KAST + 0.20 × OD% + 0.15 × min(KD/2, 1) + 0.10 × HS%)
```

| Vekt | Metrikk | Begrunnelse |
|------|---------|-------------|
| 30% | DPR (damage per round) | Stabil ved lave rundetall; fanger partial contributions (skader uten kills). Stabiliserer ved ~150 runder. |
| 25% | KAST% | Kill/Assist/Survive/Trade-rate. Mål på rundeimpact og konsistens. Validert som sterk korrelat med rundeseier. |
| 20% | Opening duel win% | Sterkeste enkelt-prediktor. Forskning fra CSGO Majors: første kill gir 70–80% rundeseier-sannsynlighet. |
| 15% | K/D (normalisert til 2.0) | Utsatt for varians ved lave utvalg — nedskalert bevisst. Stabiliserer ved ~400 runder. |
| 10% | HS% | Indirekte sigt-indikator. Kontekstsensitiv (noen roller sprayer mer). |

### Begrunnelse for vektfordeling

K/D er bevisst lav-vektet fordi:
- Statistisk stabilitet krever ~400+ runder (vi har 38–210)
- Forklarer 74% av variansen i HLTV Rating 2.0 — men dette er korrelasjon, ikke uavhengig info
- DPR fanger det K/D fanger, *pluss* partial contributions

## Rekency-vekting

Kamper vektes etter relevans og aktualitet:

```python
MATCH_WEIGHTS = {
    "qual_r1": 0.5,   # Kvalifisering R1 — annerledes format, eldre
    "qual_r2": 0.6,
    "qual_r3": 0.7,
    "bl_r1":   0.7,   # BL-sesong — høyere kontekstrelevans
    "bl_r2":   1.0,
    "bl_r3":   1.5,   # Senest spilte kamp teller mest
}
```

**Effektive runder** (vektet sum):
```python
effective_rounds = sum(weight * rounds for weight, rounds in matches)
```

## Bayesiansk kombineringsstrategi

### Prinsipp

- **Prior**: Leetify-data = hva vi forventer fra lang matchmaking-historikk
- **Evidens**: BL-data = observasjoner fra rett kontekstnivå
- **Posterior**: Vektet kombinasjon som lener seg mer mot BL jo mer data vi har

### BL-vektformel

```python
def bl_weight(effective_rounds, context_multiplier=1.5, prior_strength=150):
    """
    context_multiplier: BL-runder er mer relevante enn matchmaking per runde
    prior_strength: antall runder det tar å halvere prior-vekten
    """
    return min(
        effective_rounds * context_multiplier /
        (effective_rounds * context_multiplier + prior_strength),
        0.75  # cap: aldri mer enn 75% BL selv ved mange runder
    )
```

Eksempel-verdier:
| Effektive runder | BL-vekt | Leetify-vekt |
|-----------------|---------|-------------|
| 35 | 26% | 74% |
| 70 | 41% | 59% |
| 110 | 52% | 48% |
| 150 | 60% | 40% |
| 210 | 68% | 32% |
| 300+ | 75% (cap) | 25% |

### Posterior-beregning

```python
def posterior(bl_stat, leetify_stat, effective_rounds):
    w = bl_weight(effective_rounds)
    return w * bl_stat + (1 - w) * leetify_stat
```

**Merk:** BL-stats og Leetify-stats er i forskjellige skalaer for noen metrikker. Sørg for normalisering:
- Leetify `rating.aim` er percentil (0–100) → konverter til andel for sammenligning
- Leetify `stats.ct_opening_duel_success_percentage` er direkte sammenlignbar med BL `opening_duel_win_ratio`

## Konfidensintervall (90 %)

### Metodikk

Approksimert propagasjon av standardfeil per metrikk:

```python
import math

def ci_90(kast, od_rate, dpr, kd, raw_rounds, od_count):
    z = 1.645  # 90% CI z-score

    # KAST: binomialformel
    kast_se = math.sqrt(kast * (1 - kast) / max(raw_rounds, 1))

    # K/D: empirisk approksimering
    kd_se = 0.15 / math.sqrt(max(raw_rounds / 20, 1))

    # DPR: empirisk approksimering
    dpr_se = 15.0 / math.sqrt(max(raw_rounds, 1))

    # Opening duel: binomialformel
    od_se = math.sqrt(od_rate * (1 - od_rate) / max(od_count, 1))

    # Composite: feilpropagasjon
    composite_se = math.sqrt(
        (0.30 / 100) ** 2 * dpr_se ** 2 +
        0.25 ** 2 * kast_se ** 2 +
        0.20 ** 2 * od_se ** 2 +
        (0.15 / 2) ** 2 * kd_se ** 2
    )

    return z * composite_se * 10  # skalert til 0–10
```

### Typiske CI-verdier

| Runder | CI (90%) | Tolkning |
|--------|----------|----------|
| 38 | ±0.86 | Svært lav presisjon — score ±0.86 |
| 78 | ±0.70 | Lav presisjon |
| 150 | ±0.80 | Moderat (KAST dominerer usikkerheten) |
| 200 | ±0.75 | God for BL-nivå |
| 300+ | ±0.65 | Stabilt |

**Viktig:** Selv med 200 runder er CI ±0.75. Ikke overdriv presisjon i presentasjon.

## Stabiliseringspunkter for CS2-statistikk

Estimert fra sportsanalogi (baseball/basketball) og CS-spesifikke egenskaper:

| Metrikk | ~70% stabilt | ~90% stabilt |
|---------|-------------|-------------|
| K/D | ~400 runder | ~1000 runder |
| ADR/DPR | ~150 runder | ~400 runder |
| KAST% | ~200 runder | ~500 runder |
| HS% | ~300 runder | ~700 runder |
| Opening duel win% | ~100 dueller | ~300 dueller |

*Med 3 BL-kamper ≈ 32–80 runder per spiller er **ingen** metrikker fullt stabilisert. Bayesiansk kombineringsstrategi er metodologisk nødvendig, ikke valgfri.*

## BL Extended Stats (fra 2026-04-03)

Kjernescore beholdes uendret. Nye BL-felt brukes som separate analysemotorer, ikke som del av en ny samlescore i v1.

### Hvorfor vi ikke blander alt inn i scoren

- `trade_kills` og `survival_ratio` er faglig sterke og relativt nyttige signaler, men representerer andre dimensjoner enn ren output-score.
- `clutches_won`, `1vX` og explosive rounds er høyimpact, men lavfrekvente og volatile.
- `rating` er for black-box til å brukes som modellinput når vi allerede har forklarbare grunnmetrikker.

### Hvordan de nye feltene brukes

**Pre-analyse (kommende kamper)**
- `survival_ratio` brukes sammen med `KAST` for å lese stabilitet og disiplin.
- `trade_kills` og `traded_deaths` brukes til å estimere lagstruktur og refrag-kvalitet.
- `firstkills` brukes sammen med OD% for å skille entry-volum fra entry-effektivitet.
- clutch-/1vX-/explosive-felter brukes bare som høyvarians notater, ikke som hovedprediktorer.

**Post-analyse (ferdigspilte kamper)**
- `teamplay_control`: trades, death-trade recovery og assist-støtte.
- `round_stability`: survival vs KAST.
- `late_round_conversion`: clutch og explosive rounds.

### Faglig tommelfingerregel

- Når et felt beskriver **struktur eller disiplin**, kan det brukes i både pre- og post-analyse.
- Når et felt beskriver **high-variance heroics**, skal det primært brukes i post-analyse.
- Når et felt er **black-box eller derivat**, skal det ikke drive modellen alene.

## James-Stein shrinkage (fremtidig forbedring)

For players med lite data bør scores "krympes" mot lagets gjennomsnitt:

```python
def james_stein_shrinkage(player_scores, raw_rounds):
    """
    Trekker individuelle scores mot lagets gjennomsnitt
    der utvalget er lite. Dokumentert å redusere MSE
    for 3+ parametre (Efron & Morris 1975).
    """
    mean = sum(player_scores) / len(player_scores)
    ss = sum((s - mean) ** 2 for s in player_scores)
    k = len(player_scores)
    shrink_factor = max(1 - (k - 3) / max(ss, 1e-9), 0)
    return [mean + shrink_factor * (s - mean) for s in player_scores]
```

*Ikke implementert i nåværende versjon — fremtidig forbedring.*

## Relevante kilder

- **HLTV Rating 2.0/3.0 metodikk**: https://www.hltv.org/news/20695/introducing-rating-20
- **Leetify rating forklaring**: https://leetify.com/blog/leetify-rating-explained/
- **Opening duel forskning (CSGO Majors)**: ResearchGate — "Effect of Pistol Round and First Kill on Match Outcome in the Counter-Strike Global Offensive Major Esports Championships" (2023)
- **Bayesiansk statistikk i sport**: Frontiers in Sports and Active Living, 2022 — "Bayesian methods in sports science"
- **James-Stein estimator**: Efron & Morris (1975) — "Data Analysis Using Stein's Estimator"
