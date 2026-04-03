# CS2 Analytics — BL Extended Stats Plan
*Written 2026-04-03. Extends Bedriftsliga advanced player stats into the current pre- and post-analysis model.*

---

## 1. Goal

Use Bedriftsliga advanced player fields to improve analysis quality without destabilising the existing score model.

The feature must:
- preserve today's composite score for continuity,
- use richer BL signals differently in upcoming vs played matches,
- improve tactical explanation quality around trades, survival, entry pressure and late-round impact,
- degrade safely when BL does not return the extended fields.

---

## 2. Modeling Principles

### Core score remains unchanged
The composite score stays:

`DPR + KAST + OD% + K/D + HS%`

Reason:
- already documented and explainable,
- stable enough for existing confidence framing,
- comparable historically,
- avoids mixing stable and highly volatile signals into one opaque number.

### Extended BL stats become analysis layers
Advanced BL fields are added as separate dimensions:
- **Trade structure** — spacing, refrags, support quality.
- **Survival discipline** — whether rounds are stabilised by real survival instead of KAST alone.
- **Entry pressure** — opening volume plus opening efficiency.
- **Late-round conversion** — clutch and explosive-round signals used descriptively, not as core prediction inputs.

### Match-state split is mandatory
- **Upcoming**: use historical, recency-weighted BL profiles to infer style, structure and risk.
- **Played**: use current-match BL stats for diagnosis, then compare to historical baseline where needed.

---

## 3. Field-by-Field Usage

### Predictive / low-to-medium variance
- `survival_ratio`
  - Use in pre- and post-analysis.
  - Interprets discipline, anchoring quality and post-plant survivability.
- `trade_kills`
  - Use in pre- and post-analysis.
  - One of the strongest teamplay signals available in BL data.
- `firstkills`
  - Use as entry-volume signal alongside OD%.
  - Separates “wins openings often” from “takes openings often”.

### Contextual / team-followup signals
- `traded_deaths`
  - Use primarily as a team-followup signal, not a player-strength penalty.
  - Helpful in post-analysis and cautious pre-match team structure reads.

### High-variance / descriptive only
- `clutches_won`
- `won_1v1` … `won_1v5`
- multi-kill distributions / explosive rounds

These belong in post-analysis and player-development commentary unless future data adds attempt counts and stronger stabilisation evidence.

### Not used as model input
- `rating`

This is preserved as raw BL context only. It overlaps heavily with existing metrics and is too black-box for core decision logic.

---

## 4. Product Behavior

### Upcoming analysis additions
Add three roster-weighted landing indicators:
- `trade_structure_edge`
- `survival_discipline_edge`
- `entry_pressure_edge`

These should:
- rely on historical BL accumulation,
- be optional/source-aware,
- never block the existing landing response,
- use conservative wording when data is incomplete.

### Played analysis additions
Add three new post-analysis sections:
- `teamplay_control`
- `round_stability`
- `late_round_conversion`

These should:
- use actual match stats first,
- explain why a team won beyond K/D and DPR,
- make trade and survival analysis less proxy-based than today.

### Role detection refinement
- `ENTRY`: OD% plus firstkill volume and traded-death context.
- `SUPP`: trade kills plus survival, not KAST alone.
- `ANCH`: survival plus CT/T tendencies.

---

## 5. Delivery Notes

### Data contract
Add a nested `bl_extended` structure to players instead of many new top-level fields.

### Guardrails
- All new fields remain optional.
- The analyzer must fall back to the current model when BL omits advanced stats.
- No new prediction logic may depend on clutch-only or explosive-round-only fields.
- UI may display derived convenience stats, but they must not be treated as primary analytical evidence.

### Validation
- Parser coverage for missing/null/string/number BL payload variants.
- Historical aggregation checks for trade/survival/firstkill flows.
- Regression verification that current scoring and win probability stay unchanged when advanced BL fields are absent.

---

## 6. Plan Links

This plan extends, but does not replace:
- `docs/methodology.md`
- `docs/plans/2026-04-01-landing-page-analytics-plan.md`
- existing played-match post-analysis behavior in `cs2-app/lib/post-analysis.ts`
