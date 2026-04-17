export function resolveProfileSteam64(
  steam64?: string | null,
  fallbackSteam64?: string,
): string | undefined {
  return steam64 ?? fallbackSteam64
}

export function deriveFirstDeathRate(
  openingLosses: number,
  totalRounds: number,
): number | null {
  if (totalRounds <= 0) return null
  return openingLosses / totalRounds
}
