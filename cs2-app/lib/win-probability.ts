/**
 * Softmax win probability from two composite scores.
 * Scale factor of 5 gives meaningful separation for score differences of ~0.1–0.3.
 */
export function winProbability(homeScore: number, awayScore: number): number {
  const scale = 5
  const eHome = Math.exp(homeScore * scale)
  const eAway = Math.exp(awayScore * scale)
  return eHome / (eHome + eAway)
}

/**
 * Round to nearest 5% to avoid false precision.
 * With CIs of ±2–5 points, sub-5% differences are noise.
 */
export function roundedProbability(p: number): number {
  return Math.round(p * 20) / 20
}
