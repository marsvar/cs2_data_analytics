/**
 * leetify-api.ts
 * --------------
 * Fetches player profiles from the Leetify public API.
 * Ported from scripts/fetch_leetify.py.
 *
 * Endpoint (2026-03): GET /v3/profile?steam64_id={id}
 * Rate limit: ~5 req/min — enforce 3 s delay between batch requests.
 */

import type {
  LeetifyData,
  LeetifyProfile,
  LeetifyProfileWithRecent,
  LeetifyRecentMatch,
} from './types'

const LEETIFY_BASE = 'https://api-public.cs-prod.leetify.com'
const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const PROFILE_NOT_FOUND_TTL_MS = 60 * 60 * 1000

type CachedProfileEntry = {
  value: LeetifyProfileWithRecent | null
  notFound: boolean
  expiresAt: number
}

const profileCache = new Map<string, CachedProfileEntry>()

function normaliseRatio(v: number | null | undefined): number {
  if (v == null || Number.isNaN(v)) return 0
  // Leetify v3 returns OD success as percentages (e.g. 52.55).
  // Normalize to 0–1 for the scoring model and UI.
  const ratio = v > 1 ? v / 100 : v
  return Math.max(0, Math.min(1, ratio))
}

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
    faceit?: number | null
    faceit_elo?: number | null
  }
  recent_matches?: Array<{
    finished_at?: string | null
    outcome?: string | null
    map_name?: string | null
    leetify_rating?: number | null
  }>
}

/**
 * Fetch a single Leetify profile by Steam64 ID.
 * Returns { data, notFound } — notFound=true on 404 (profile doesn't exist),
 * data=null on any error/missing profile.
 */
export async function getProfile(
  steam64: string,
  token: string,
): Promise<{
  data: RawLeetifyProfile | null
  notFound: boolean
  status: number
  retryAfterSeconds?: number
}> {
  const query = new URLSearchParams({ steam64_id: steam64 }).toString()
  const res = await fetch(`${LEETIFY_BASE}/v3/profile?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (res.status === 404) {
    return { data: null, notFound: true, status: 404 }
  }
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'))
    console.warn(`Leetify: ${res.status} for steam ${steam64}`)
    return {
      data: null,
      notFound: false,
      status: res.status,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : undefined,
    }
  }
  const data = (await res.json()) as RawLeetifyProfile
  return {
    data: data.error ? null : data,
    notFound: false,
    status: 200,
  }
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
 * Leetify percentile ratings are 0–100; OD rates are normalised to 0–1.
 */
export function toLeetifyData(raw: RawLeetifyProfile): LeetifyData {
  const rating = raw.rating ?? {}
  const stats = raw.stats ?? {}
  const ranks = raw.ranks ?? {}
  return {
    aim: rating.aim ?? 0,
    positioning: rating.positioning ?? 0,
    utility: rating.utility ?? 0,
    clutch: rating.clutch ?? 0,
    opening: rating.opening ?? 0,
    ct_od: normaliseRatio(stats.ct_opening_duel_success_percentage),
    t_od: normaliseRatio(stats.t_opening_duel_success_percentage),
    reaction_time_ms: stats.reaction_time_ms ?? 0,
    premier: ranks.premier ?? undefined,
    faceit_level: ranks.faceit ?? undefined,
    faceit_elo: ranks.faceit_elo ?? undefined,
  }
}

function parseRecentMatches(raw: RawLeetifyProfile): LeetifyRecentMatch[] {
  const recentMatches = raw.recent_matches ?? []
  const out: LeetifyRecentMatch[] = []

  for (const match of recentMatches) {
    const finishedAt = match.finished_at ?? ''
    const mapName = (match.map_name ?? '').trim()
    if (!finishedAt || !mapName) continue

    const outcomeRaw = (match.outcome ?? '').toLowerCase()
    if (outcomeRaw !== 'win' && outcomeRaw !== 'loss' && outcomeRaw !== 'tie') continue

    out.push({
      finished_at: finishedAt,
      map_name: mapName.toLowerCase(),
      outcome: outcomeRaw,
      leetify_rating: match.leetify_rating ?? 0,
    })
  }

  return out
}

/**
 * Batch-fetch Leetify profiles with a 3 s rate-limit delay between requests.
 * Calls onProgress(completed, total) after each fetch if provided.
 *
 * Returns a map of steam64 → LeetifyProfileWithRecent (failed/null profiles are omitted).
 */
export async function fetchProfiles(
  steamIds: string[],
  token: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, LeetifyProfileWithRecent>> {
  const results = new Map<string, LeetifyProfileWithRecent>()
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  for (let i = 0; i < steamIds.length; i++) {
    const steam64 = steamIds[i]
    const now = Date.now()
    const cached = profileCache.get(steam64)
    if (cached && cached.expiresAt > now) {
      if (cached.value) results.set(steam64, cached.value)
      onProgress?.(i + 1, steamIds.length)
      continue
    }

    let notFound = false
    let throttled = false
    let attempts = 0
    try {
      // Retry a few times on rate limit to avoid dropping late-batch players.
      while (attempts < 3) {
        const result = await getProfile(steam64, token)
        notFound = result.notFound

        if (result.data) {
          const parsed = {
            summary: toLeetifyData(result.data),
            recent_matches: parseRecentMatches(result.data),
          } satisfies LeetifyProfileWithRecent
          results.set(steam64, parsed)
          profileCache.set(steam64, {
            value: parsed,
            notFound: false,
            expiresAt: now + PROFILE_CACHE_TTL_MS,
          })
          break
        }
        if (result.notFound) {
          profileCache.set(steam64, {
            value: null,
            notFound: true,
            expiresAt: now + PROFILE_NOT_FOUND_TTL_MS,
          })
        }
        if (result.status === 429) {
          throttled = true
          attempts += 1
          const waitSeconds = result.retryAfterSeconds ?? 10
          await sleep(waitSeconds * 1000)
          continue
        }
        break
      }
    } catch {
      // Skip failed profiles — caller gets a partial map
    }

    onProgress?.(i + 1, steamIds.length)

    // Respect Leetify rate limit (~5 req/min) — skip delay after last item,
    // and skip delay on 404 (profile doesn't exist — no quota consumed).
    if (!notFound && i < steamIds.length - 1) {
      await sleep(throttled ? 5000 : 3000)
    }
  }

  return results
}

// Re-export Leetify profile types so consumers can import from one place
export type { LeetifyData, LeetifyProfileWithRecent, LeetifyRecentMatch }
