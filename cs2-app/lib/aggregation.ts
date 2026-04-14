/**
 * aggregation.ts
 * --------------
 * Scoring model and Bayesian aggregation logic.
 * Ported from scripts/aggregate_player_stats.py.
 *
 * All formulas match the Python originals exactly.
 */

import type { BLPlayerStats, LeetifyData, PlayerAnalysis } from './types'

// ---------------------------------------------------------------------------
// Core scoring functions
// ---------------------------------------------------------------------------

/**
 * Composite performance score on a 0–1 scale.
 * Multiply by 10 for a 0–10 display score.
 *
 * Weights:
 *   30% DPR/100 · 25% KAST · 20% OD win rate · 15% min(KD/2,1) · 10% HS rate
 */
export function compositeScore(
  dpr: number,
  kast: number,
  odRate: number,
  kd: number,
  hs: number,
): number {
  return (
    0.30 * (dpr / 100) +
    0.25 * kast +
    0.20 * odRate +
    0.15 * Math.min(kd / 2, 1.0) +
    0.10 * hs
  )
}

/**
 * Bayesian weight for BL data vs Leetify prior.
 * Capped at 0.75 — always retains ≥ 25% Leetify prior.
 *
 * @param effectiveRounds  Recency-weighted round count
 * @param contextMult      Default 1.5 (from Python)
 * @param priorStrength    Default 150 (from Python)
 */
export function blWeight(
  effectiveRounds: number,
  contextMult = 1.5,
  priorStrength = 150,
): number {
  if (effectiveRounds <= 0) return 0.0
  return Math.min(
    (effectiveRounds * contextMult) /
      (effectiveRounds * contextMult + priorStrength),
    0.75,
  )
}

/**
 * Approximate 90% CI half-width for the composite score (0–10 scale).
 * Propagated standard errors across all four components.
 *
 * @param kast       KAST ratio (0–1)
 * @param odRate     Opening duel win rate (0–1)
 * @param dpr        Damage per round
 * @param kd         Kill/death ratio
 * @param rawRounds  Unweighted round count
 * @param odCount    Effective number of opening duel observations
 */
export function ci90(
  kast: number,
  odRate: number,
  dpr: number,
  kd: number,
  rawRounds: number,
  odCount: number,
): number {
  const z = 1.645
  const n = Math.max(rawRounds, 1)

  const kastSe = Math.sqrt((kast * (1 - kast)) / n)
  const kdSe = 0.15 / Math.sqrt(Math.max(n / 20, 1))
  const dprSe = 15.0 / Math.sqrt(n)
  const odSe = Math.sqrt(
    (odRate * (1 - odRate)) / Math.max(odCount, 1),
  )

  const compositeSe = Math.sqrt(
    (0.3 / 100) ** 2 * dprSe ** 2 +
      0.25 ** 2 * kastSe ** 2 +
      0.2 ** 2 * odSe ** 2 +
      (0.15 / 2) ** 2 * kdSe ** 2,
  )

  return Math.round(z * compositeSe * 10 * 100) / 100
}

// ---------------------------------------------------------------------------
// Recency weights (matches WEIGHTS dict in aggregate_player_stats.py)
// ---------------------------------------------------------------------------

export const RECENCY_WEIGHTS: Record<string, number> = {
  qual_r1: 0.5,
  qual_r2: 0.6,
  qual_r3: 0.7,
  bl_r1: 0.7,
  bl_r2: 1.0,
  bl_r3: 1.5,
  default: 0.8,
}

// ---------------------------------------------------------------------------
// Per-player analysis builder
// ---------------------------------------------------------------------------

/**
 * Combine BL match stats with an optional Leetify profile via Bayesian
 * weighting and produce a PlayerAnalysis record.
 *
 * When leetify is provided the final score is a weighted blend:
 *   score = w_bl * bl_score + (1 - w_bl) * leetify_prior_score
 *
 * The Leetify prior score is derived from aim/positioning percentiles
 * (normalised to 0–1) as a simple proxy for composite performance.
 *
 * @param player      BLPlayerStats for this player (single match)
 * @param steam64     Optional Steam64 ID (for Leetify lookup)
 * @param leetify     Optional Leetify summary for this player
 * @param matchType   Recency label e.g. 'bl_r2' (default: 'default')
 */
export function buildPlayerAnalysis(
  player: BLPlayerStats,
  steam64?: string,
  leetify?: LeetifyData,
  matchType = 'default',
): PlayerAnalysis {
  const weight = RECENCY_WEIGHTS[matchType] ?? RECENCY_WEIGHTS.default
  const rounds = player.rounds
  const wRounds = weight * rounds

  // Derived per-match rates
  const kd =
    player.deaths > 0
      ? player.kills / player.deaths
      : player.kills
  // damage stored as total; derive DPR
  const dpr = rounds > 0 ? player.damage / rounds : 0
  const kast = player.kast   // already a ratio (0–1) from BL API
  const hs = player.hs       // already a ratio (0–1) from BL API
  const odTotal = player.opening_attempts  // opening_attempts = won + lost
  const odRate = odTotal > 0 ? player.opening_kills / odTotal : 0

  const odCount = wRounds > 0 ? odTotal / Math.max(wRounds / 20, 1) : 0
  const rawScore = compositeScore(dpr, kast, odRate, kd, hs)
  const ci = ci90(kast, odRate, dpr, kd, rounds, odCount)

  let finalScore = rawScore
  let dataSource: PlayerAnalysis['data_source'] = 'bl'

  if (leetify) {
    // Leetify prior: average of aim + positioning percentiles, normalised 0–1
    // These percentiles already represent relative performance.
    // We map them to a comparable composite proxy.
    const leetifyPrior =
      (leetify.aim / 100) * 0.4 +
      (leetify.positioning / 100) * 0.3 +
      ((leetify.ct_od + leetify.t_od) / 2) * 0.3

    const w = blWeight(wRounds)
    finalScore = w * rawScore + (1 - w) * leetifyPrior
    dataSource = 'combined'
  }

  return {
    name: player.name,
    paradise_user_id: player.paradise_user_id,
    steam64,
    score: Math.round(finalScore * 10000) / 10000,
    ci,
    rounds,
    assists: player.assists,
    kd: Math.round(kd * 1000) / 1000,
    kast: Math.round(kast * 10000) / 10000,
    dpr: Math.round(dpr * 10) / 10,
    hs: Math.round(hs * 10000) / 10000,
    od_rate: Math.round(odRate * 10000) / 10000,
    bl_weight: leetify ? Math.round(blWeight(wRounds) * 10000) / 10000 : undefined,
    effective_rounds: Math.round(wRounds * 10) / 10,
    leetify,
    data_source: dataSource,
  }
}
