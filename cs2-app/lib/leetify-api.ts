/**
 * leetify-api.ts
 * --------------
 * Fetches player profiles from the Leetify public API.
 * Ported from scripts/fetch_leetify.py.
 *
 * Rate limit: ~5 req/min — enforce 3 s delay between batch requests.
 */

import type { LeetifyData, LeetifyProfile } from './types'

const LEETIFY_BASE = 'https://api-public.cs-prod.leetify.com'

// Full raw profile shape returned by Leetify
type RawLeetifyProfile = {
  name?: string
  steam64_id?: string
  privacy_mode?: string
  total_matches?: number
  winrate?: number
  error?: string
  rating?: {
    aim?: number | null
    positioning?: number | null
    utility?: number | null
    clutch?: number | null
    opening?: number | null
  }
  stats?: {
    ct_opening_duel_success_percentage?: number | null
    t_opening_duel_success_percentage?: number | null
    ct_opening_aggression_success_rate?: number | null
    t_opening_aggression_success_rate?: number | null
    accuracy_head?: number | null
    accuracy_enemy_spotted?: number | null
    reaction_time_ms?: number | null
    spray_accuracy?: number | null
    flashbang_leading_to_kill?: number | null
    he_foes_damage_avg?: number | null
  }
  ranks?: {
    leetify?: number | null
    premier?: number | null
    faceit_elo?: number | null
  }
}

/**
 * Fetch a single Leetify profile by Steam64 ID.
 * Throws on HTTP error; returns null if the profile has an error field.
 */
export async function getProfile(
  steam64: string,
  token: string,
): Promise<RawLeetifyProfile | null> {
  const res = await fetch(`${LEETIFY_BASE}/api/profile/steam/${steam64}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Leetify API ${res.status}: ${steam64}`)
  const data = (await res.json()) as RawLeetifyProfile
  if (data.error) return null
  return data
}

/**
 * Extract the fields relevant to the scoring model from a raw Leetify profile.
 * Returns a typed LeetifyProfile (as defined in types.ts).
 */
export function extractRelevant(raw: RawLeetifyProfile): LeetifyProfile {
  const rating = raw.rating ?? {}
  const stats = raw.stats ?? {}
  return {
    rating: {
      aim: rating.aim ?? 0,
      positioning: rating.positioning ?? 0,
      utility: rating.utility ?? 0,
      clutch: rating.clutch ?? 0,
      opening: rating.opening ?? 0,
    },
    stats: {
      ct_opening_duel_success_percentage:
        stats.ct_opening_duel_success_percentage ?? 0,
      t_opening_duel_success_percentage:
        stats.t_opening_duel_success_percentage ?? 0,
      reaction_time_ms: stats.reaction_time_ms ?? 0,
    },
  }
}

/**
 * Convert a raw Leetify profile into the LeetifyData summary used by
 * PlayerAnalysis. Mirrors the fields used in aggregation.ts.
 *
 * Leetify percentile ratings are 0–100; OD success rates are 0–1.
 */
export function toLeetifyData(raw: RawLeetifyProfile): LeetifyData {
  const rating = raw.rating ?? {}
  const stats = raw.stats ?? {}
  return {
    aim: rating.aim ?? 0,
    positioning: rating.positioning ?? 0,
    utility: rating.utility ?? 0,
    ct_od: stats.ct_opening_duel_success_percentage ?? 0,
    t_od: stats.t_opening_duel_success_percentage ?? 0,
  }
}

/**
 * Batch-fetch Leetify profiles with a 3 s rate-limit delay between requests.
 * Calls onProgress(completed, total) after each fetch if provided.
 *
 * Returns a map of steam64 → LeetifyData (failed/null profiles are omitted).
 */
export async function fetchProfiles(
  steamIds: string[],
  token: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, LeetifyData>> {
  const results = new Map<string, LeetifyData>()

  for (let i = 0; i < steamIds.length; i++) {
    const steam64 = steamIds[i]
    try {
      const raw = await getProfile(steam64, token)
      if (raw) {
        results.set(steam64, toLeetifyData(raw))
      }
    } catch {
      // Skip failed profiles — caller gets a partial map
    }

    onProgress?.(i + 1, steamIds.length)

    // Respect Leetify rate limit (~5 req/min) — skip delay after last item
    if (i < steamIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  return results
}

// Re-export LeetifyData so consumers can import from one place
export type { LeetifyData }
