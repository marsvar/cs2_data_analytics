import type {
  LeetifyProfileWithRecent,
  MapInsight,
  PlayerMapContribution,
} from '@/lib/types'

type TeamCandidate = {
  userId: number
  avatarUrl?: string
}

type TeamMapPoolSummary = {
  maps: MapInsight[]
  included_players: number
  excluded_players: number
}

type BuildTeamMapPoolParams = {
  candidates: TeamCandidate[]
  steamByUserId: Map<number, string>
  profiles: Map<string, LeetifyProfileWithRecent>
  referenceTime: Date
  recentDays: number
  minMatchesPerPlayer: number
}

type BuildTeamPlayerMapContributionsParams = BuildTeamMapPoolParams & {
  nameByUserId?: Map<number, string>
}

type TeamMapSeries = {
  maps: Array<{
    map: string
    won: boolean
  }>
}

// Default Active Duty pool (Premier) as of January 2026:
// Anubis, Ancient, Dust2, Inferno, Mirage, Nuke, Overpass.
const DEFAULT_ACTIVE_DUTY_MAPS = new Set<string>([
  'de_anubis',
  'de_ancient',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_overpass',
])

const MAP_ALIAS_TO_CANONICAL: Record<string, string> = {
  anubis: 'de_anubis',
  ancient: 'de_ancient',
  dust2: 'de_dust2',
  dustii: 'de_dust2',
  inferno: 'de_inferno',
  mirage: 'de_mirage',
  nuke: 'de_nuke',
  overpass: 'de_overpass',
}

function canonicalFromInput(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase()
  if (!cleaned) return null

  // Accept explicit canonical map keys from env (e.g. de_train) so
  // map-pool rotations can be configured without code changes.
  if (/^de_[a-z0-9]+$/.test(cleaned)) return cleaned

  const compact = cleaned.replace(/[^a-z0-9]/g, '')
  return MAP_ALIAS_TO_CANONICAL[compact] ?? null
}

function resolveActiveDutyMapsFromEnv(): Set<string> {
  const raw = process.env.CS2_ACTIVE_DUTY_MAPS
  if (!raw) return new Set(DEFAULT_ACTIVE_DUTY_MAPS)

  const resolved = new Set<string>()
  for (const token of raw.split(',')) {
    const canonical = canonicalFromInput(token)
    if (canonical) resolved.add(canonical)
  }

  if (resolved.size === 0) {
    console.warn('CS2_ACTIVE_DUTY_MAPS had no valid entries; using default active-duty map pool.')
    return new Set(DEFAULT_ACTIVE_DUTY_MAPS)
  }

  return resolved
}

const ACTIVE_DUTY_MAPS = resolveActiveDutyMapsFromEnv()

export function getActiveDutyMaps(): string[] {
  return Array.from(ACTIVE_DUTY_MAPS).sort()
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

function confidenceFromSample(sampleSize: number): MapInsight['confidence'] {
  if (sampleSize >= 20) return 'high'
  if (sampleSize >= 8) return 'medium'
  return 'low'
}

function safeDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(older: Date, newer: Date): number {
  return (newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24)
}

export function normalizeActiveDutyMap(rawMap: string): string | null {
  const canonical = canonicalFromInput(rawMap)
  if (!canonical) return null
  if (!ACTIVE_DUTY_MAPS.has(canonical)) return null
  return canonical
}

function filteredRecentActiveMatches(
  profile: LeetifyProfileWithRecent,
  referenceTime: Date,
  recentDays: number,
) {
  return profile.recent_matches.filter((match) => {
    const finished = safeDate(match.finished_at)
    if (!finished) return false
    const ageDays = daysBetween(finished, referenceTime)
    if (ageDays < 0 || ageDays > recentDays) return false
    return normalizeActiveDutyMap(match.map_name) != null
  })
}

export function buildTeamPlayerMapContributions({
  candidates,
  steamByUserId,
  profiles,
  referenceTime,
  recentDays,
  minMatchesPerPlayer,
  nameByUserId,
}: BuildTeamPlayerMapContributionsParams): PlayerMapContribution[] {
  const candidateByUserId = new Map<number, TeamCandidate>()
  for (const candidate of candidates) {
    if (!candidateByUserId.has(candidate.userId)) {
      candidateByUserId.set(candidate.userId, candidate)
    }
  }

  const uniqueCandidates = Array.from(candidateByUserId.keys())

  return uniqueCandidates.map((userId) => {
    const candidate = candidateByUserId.get(userId)
    const steam64 = steamByUserId.get(userId)
    if (!steam64) {
      return {
        paradise_user_id: userId,
        name: nameByUserId?.get(userId) ?? `User ${userId}`,
        avatar_url: candidate?.avatarUrl,
        included: false,
        matches_considered: 0,
        maps: [],
      }
    }

    const profile = profiles.get(steam64)
    if (!profile) {
      return {
        paradise_user_id: userId,
        name: nameByUserId?.get(userId) ?? `User ${userId}`,
        avatar_url: candidate?.avatarUrl,
        included: false,
        matches_considered: 0,
        maps: [],
      }
    }

    const filtered = filteredRecentActiveMatches(profile, referenceTime, recentDays)
    if (filtered.length < minMatchesPerPlayer) {
      return {
        paradise_user_id: userId,
        name: nameByUserId?.get(userId) ?? `User ${userId}`,
        avatar_url: candidate?.avatarUrl,
        included: false,
        matches_considered: filtered.length,
        maps: [],
      }
    }

    const byMap = new Map<string, { wins: number; total: number; ratingSum: number }>()
    for (const match of filtered) {
      const map = normalizeActiveDutyMap(match.map_name)
      if (!map) continue
      const existing = byMap.get(map) ?? { wins: 0, total: 0, ratingSum: 0 }
      existing.total += 1
      if (match.outcome === 'win') existing.wins += 1
      existing.ratingSum += match.leetify_rating
      byMap.set(map, existing)
    }

    const maps = Array.from(byMap.entries())
      .map(([map, agg]) => ({
        map,
        wins: agg.wins,
        total: agg.total,
        rating_sum: round4(agg.ratingSum),
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        return a.map.localeCompare(b.map)
      })

    return {
      paradise_user_id: userId,
      name: nameByUserId?.get(userId) ?? `User ${userId}`,
      avatar_url: candidate?.avatarUrl,
      included: true,
      matches_considered: filtered.length,
      maps,
    }
  })
}

export function buildTeamMapPool({
  candidates,
  steamByUserId,
  profiles,
  referenceTime,
  recentDays,
  minMatchesPerPlayer,
}: BuildTeamMapPoolParams): TeamMapPoolSummary {
  const contributions = buildTeamPlayerMapContributions({
    candidates,
    steamByUserId,
    profiles,
    referenceTime,
    recentDays,
    minMatchesPerPlayer,
  })

  const byMap = new Map<string, { wins: number; total: number; ratingSum: number }>()
  let includedPlayers = 0
  let excludedPlayers = 0

  for (const contribution of contributions) {
    if (!contribution.included) {
      excludedPlayers += 1
      continue
    }

    includedPlayers += 1
    for (const map of contribution.maps) {
      const existing = byMap.get(map.map) ?? { wins: 0, total: 0, ratingSum: 0 }
      existing.wins += map.wins
      existing.total += map.total
      existing.ratingSum += map.rating_sum
      byMap.set(map.map, existing)
    }
  }

  const maps = Array.from(byMap.entries())
    .map(([map, agg]) => ({
      map,
      wins: agg.wins,
      losses: Math.max(agg.total - agg.wins, 0),
      win_rate: round4(agg.total > 0 ? agg.wins / agg.total : 0),
      avg_leetify_rating: round4(agg.total > 0 ? agg.ratingSum / agg.total : 0),
      sample_size: agg.total,
      confidence: confidenceFromSample(agg.total),
    } satisfies MapInsight))
    .sort((a, b) => {
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate
      return b.sample_size - a.sample_size
    })

  return {
    maps,
    included_players: includedPlayers,
    excluded_players: excludedPlayers,
  }
}

export function buildTeamMapPoolFromBlSeries(series: TeamMapSeries[]): TeamMapPoolSummary {
  const byMap = new Map<string, { wins: number; total: number }>()
  let includedSeries = 0
  let excludedSeries = 0

  for (const entry of series) {
    if (entry.maps.length === 0) {
      excludedSeries += 1
      continue
    }

    includedSeries += 1
    for (const map of entry.maps) {
      const existing = byMap.get(map.map) ?? { wins: 0, total: 0 }
      existing.total += 1
      if (map.won) existing.wins += 1
      byMap.set(map.map, existing)
    }
  }

  const maps = Array.from(byMap.entries())
    .map(([map, agg]) => ({
      map,
      wins: agg.wins,
      losses: Math.max(agg.total - agg.wins, 0),
      win_rate: round4(agg.total > 0 ? agg.wins / agg.total : 0),
      avg_leetify_rating: 0,
      sample_size: agg.total,
      confidence: confidenceFromSample(agg.total),
    } satisfies MapInsight))
    .sort((a, b) => {
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate
      return b.sample_size - a.sample_size
    })

  return {
    maps,
    included_players: includedSeries,
    excluded_players: excludedSeries,
  }
}
