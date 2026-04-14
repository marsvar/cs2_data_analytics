/**
 * bl-api.ts
 * ---------
 * Fetches match stats from the Bedriftsligaen API.
 * Ported from scripts/fetch_match_stats.py.
 *
 * BL API raw field names (from aggregate_player_stats.py field access):
 *   player_name, rounds_played, kills, deaths, damage_per_round,
 *   kast_ratio, headshot_ratio, opening_duels_won, opening_duels_lost,
 *   firstkills, paradise_user_id
 *
 * The /matchup/{id}/stats endpoint returns a flat array of player objects.
 * Team membership is inferred from signup data on the matchup object itself;
 * here we return raw player rows and let the caller split by team.
 */

import type { BLMatchupStats, BLPlayerStats } from './types'
import { normalizeBlImageUrl } from './bl-image-url'

const BL_BASE = 'https://app.bedriftsligaen.no/api/paradise/v2'
const BL_LEGACY_BASE = 'https://app.bedriftsligaen.no/api/paradise'
const MATCHUP_STATS_TTL_MS = 5 * 60 * 1000
const MATCHUP_META_TTL_MS = 5 * 60 * 1000
const DIVISION_MATCHUPS_TTL_MS = 2 * 60 * 1000
const TEAM_MATCHUPS_TTL_MS = 5 * 60 * 1000
const TEAM_PLAYERS_TTL_MS = 15 * 60 * 1000
const COMPETITION_LINEUP_TTL_MS = 2 * 60 * 1000
const USER_PROFILE_TTL_MS = 6 * 60 * 60 * 1000
const COMPETITIONS_TTL_MS = 30 * 60 * 1000
const COMPETITION_SIGNUPS_TTL_MS = 30 * 60 * 1000
const COMPETITION_DIVISIONS_TTL_MS = 30 * 60 * 1000
const blResponseCache = new Map<string, { value: unknown; expiresAt: number }>()
const blInflight = new Map<string, Promise<unknown>>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function blGet<T>(
  endpoint: string,
  token: string,
  options?: { ttlMs?: number },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 0
  const cacheKey = `${token}:${endpoint}`
  const now = Date.now()

  if (ttlMs > 0) {
    const cached = blResponseCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.value as T
    }

    const inflight = blInflight.get(cacheKey)
    if (inflight) {
      return inflight as Promise<T>
    }
  }

  const request = (async () => {
    const res = await fetch(`${BL_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`BL API ${res.status}: ${endpoint}`)
    const data = await res.json() as T

    if (ttlMs > 0) {
      blResponseCache.set(cacheKey, {
        value: data,
        expiresAt: Date.now() + ttlMs,
      })
    }

    return data
  })()

  if (ttlMs <= 0) {
    return request
  }

  blInflight.set(cacheKey, request as Promise<unknown>)
  try {
    return await request
  } finally {
    blInflight.delete(cacheKey)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function blGetLegacy<T>(
  endpoint: string,
  token: string,
  options?: { ttlMs?: number },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? 0
  const cacheKey = `${token}:${BL_LEGACY_BASE}:${endpoint}`
  const now = Date.now()

  if (ttlMs > 0) {
    const cached = blResponseCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.value as T
    }

    const inflight = blInflight.get(cacheKey)
    if (inflight) {
      return inflight as Promise<T>
    }
  }

  const request = (async () => {
    const res = await fetch(`${BL_LEGACY_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`BL API ${res.status}: ${endpoint}`)
    const data = await res.json() as T

    if (ttlMs > 0) {
      blResponseCache.set(cacheKey, {
        value: data,
        expiresAt: Date.now() + ttlMs,
      })
    }

    return data
  })()

  if (ttlMs <= 0) {
    return request
  }

  blInflight.set(cacheKey, request as Promise<unknown>)
  try {
    return await request
  } finally {
    blInflight.delete(cacheKey)
  }
}

async function getRawMatchup(matchupId: number, token: string): Promise<any> {
  return blGet<any>(`/matchup/${matchupId}`, token, { ttlMs: MATCHUP_META_TTL_MS })
}

async function getRawUser(userId: number, token: string): Promise<any> {
  return blGet<any>(`/user/${userId}`, token, { ttlMs: USER_PROFILE_TTL_MS })
}

async function getRawDivisionMatchups(
  divisionId: number,
  token: string,
): Promise<unknown[]> {
  type Raw = { data?: unknown[] } | unknown[]
  const data = await blGet<Raw>(
    `/matchup?division_id=${divisionId}&limit=100`,
    token,
    { ttlMs: DIVISION_MATCHUPS_TTL_MS },
  )
  return Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
}

// Raw shape returned by /matchup/{id}/stats (flat player array)
// Field names confirmed from aggregate_player_stats.py
type RawPlayer = {
  paradise_user_id?: number
  player_name?: string
  name?: string
  rounds_played?: number
  kills?: number
  deaths?: number
  assists?: number
  // damage_per_round is a rate; total damage not exposed directly
  damage_per_round?: number | null
  damage?: number
  kast_ratio?: number | null
  headshot_ratio?: number | null
  survival_ratio?: number | null
  opening_duels_won?: number
  opening_duels_lost?: number
  opening_duel_win_ratio?: number | null
  firstkills?: number
  clutches_won?: number
  trade_kills?: number
  traded_deaths?: number
  won_1v1?: number
  won_1v2?: number
  won_1v3?: number
  won_1v4?: number
  won_1v5?: number
  rating?: number | string | null
  damage_diff?: number | string | null
  rounds_with_2k?: number
  rounds_with_3k?: number
  rounds_with_4k?: number
  rounds_with_5k?: number
  maps_played?: number
  // side distinguishes home vs away in flat array responses (team/signup are null)
  side?: string | number
  // team info may be nested (present on some endpoint variants)
  team?: { id?: number; name?: string }
  signup?: { team?: { id?: number; name?: string } }
}

type RawMatchupStats = RawPlayer[] | {
  data?: RawPlayer[]
  home_team?: { id?: number; name?: string }
  away_team?: { id?: number; name?: string }
  home_players?: RawPlayer[]
  away_players?: RawPlayer[]
  total_rounds?: number
  matchup_id?: number
}

function mapPlayer(p: RawPlayer): BLPlayerStats {
  const rounds = p.rounds_played ?? 0
  const dpr = p.damage_per_round ?? 0
  const rating = toOptionalNumber(p.rating)
  const damageDiff = toOptionalNumber(p.damage_diff)
  return {
    paradise_user_id: p.paradise_user_id ?? 0,
    // API uses player_name; fall back to name
    name: p.player_name ?? p.name ?? '',
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    // Reconstruct total damage from rate × rounds for BLPlayerStats.damage
    damage: p.damage ?? Math.round(dpr * rounds),
    rounds,
    hs: p.headshot_ratio ?? 0,
    kast: p.kast_ratio ?? 0,
    opening_kills: p.opening_duels_won ?? p.firstkills ?? 0,
    opening_attempts: (p.opening_duels_won ?? 0) + (p.opening_duels_lost ?? 0),
    bl_extended: {
      survival_ratio: p.survival_ratio ?? undefined,
      trade_kills: p.trade_kills ?? undefined,
      traded_deaths: p.traded_deaths ?? undefined,
      firstkills: p.firstkills ?? undefined,
      clutches_won: p.clutches_won ?? undefined,
      won_1v1: p.won_1v1 ?? undefined,
      won_1v2: p.won_1v2 ?? undefined,
      won_1v3: p.won_1v3 ?? undefined,
      won_1v4: p.won_1v4 ?? undefined,
      won_1v5: p.won_1v5 ?? undefined,
      one_v_x_total: (p.won_1v1 ?? 0) + (p.won_1v2 ?? 0) + (p.won_1v3 ?? 0) + (p.won_1v4 ?? 0) + (p.won_1v5 ?? 0) || undefined,
      rating: rating ?? undefined,
      damage_diff: damageDiff ?? undefined,
      explosive_rounds_total: (p.rounds_with_3k ?? 0) + (p.rounds_with_4k ?? 0) + (p.rounds_with_5k ?? 0) || undefined,
      multi_kills: {
        rounds_with_2k: p.rounds_with_2k ?? undefined,
        rounds_with_3k: p.rounds_with_3k ?? undefined,
        rounds_with_4k: p.rounds_with_4k ?? undefined,
        rounds_with_5k: p.rounds_with_5k ?? undefined,
      },
    },
    maps_played: p.maps_played ?? undefined,
  }
}

type MatchWinner = 'home' | 'away' | 'draw' | 'unknown'

type MatchupMapSummary = {
  name?: string
  image_url?: string
  home_score?: number | null
  away_score?: number | null
  winner?: MatchWinner
  source: 'api'
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseWinner(
  value: unknown,
  homeTeamId?: number,
  awayTeamId?: number,
  homeScore?: number | null,
  awayScore?: number | null,
): MatchWinner {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'home') return 'home'
    if (normalized === 'away') return 'away'
    if (normalized === 'draw' || normalized === 'tie') return 'draw'
  }

  const winnerId = toOptionalNumber(value)
  if (winnerId != null) {
    if (homeTeamId != null && winnerId === homeTeamId) return 'home'
    if (awayTeamId != null && winnerId === awayTeamId) return 'away'
  }

  if (homeScore != null && awayScore != null) {
    if (homeScore > awayScore) return 'home'
    if (awayScore > homeScore) return 'away'
    if (homeScore === awayScore) return 'draw'
  }

  return 'unknown'
}

function parseMapArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  return []
}

function extractMapSummaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  homeTeamId?: number,
  awayTeamId?: number,
): { maps: MatchupMapSummary[]; completeness: 'full' | 'partial' | 'missing'; note?: string } {
  const candidateArrays = [
    raw?.matchupmaps,
    raw?.maps,
    raw?.map_results,
    raw?.map_scores,
    raw?.mapScores,
    raw?.match_maps,
    raw?.series?.maps,
    raw?.results?.maps,
    raw?.stats?.maps,
  ]

  let sourceArray: unknown[] = []
  for (const candidate of candidateArrays) {
    const arr = parseMapArray(candidate)
    if (arr.length > 0) {
      sourceArray = arr
      break
    }
  }

  if (sourceArray.length === 0) {
    return {
      maps: [],
      completeness: 'missing',
      note: 'Map details were not returned from the BL API for this match.',
    }
  }

  const maps: MatchupMapSummary[] = []
  for (const entry of sourceArray) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (entry ?? {}) as any
    const name = [
      row.resource?.name,
      row.resource_name,
      row.map_name,
      row.name,
      row.map,
      row.slug,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined

    const homeScore = toOptionalNumber(
      row.home_score ?? row.team1_score ?? row.score_home ?? row.home_rounds,
    )
    const awayScore = toOptionalNumber(
      row.away_score ?? row.team2_score ?? row.score_away ?? row.away_rounds,
    )
    const winner = parseWinner(
      row.winner ?? row.winner_id ?? row.winner_team_id ?? row.winning_side,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
    )
    const mapNumber = toOptionalNumber(row.map_number)
    const finalName = name ?? (mapNumber != null ? `Map ${mapNumber}` : undefined)
    const imageUrl = normalizeBlImageUrl(
      row.resource?.image?.url ?? row.image?.url,
      row.resource?.image?.relative_url ?? row.image?.relative_url,
    )

    if (!finalName && homeScore == null && awayScore == null && winner === 'unknown') continue

    maps.push({
      name: finalName,
      image_url: imageUrl,
      home_score: homeScore,
      away_score: awayScore,
      winner,
      source: 'api',
    })
  }

  if (maps.length === 0) {
    return {
      maps: [],
      completeness: 'missing',
      note: 'Map details were not returned from the BL API for this match.',
    }
  }

  const full = maps.every((m) => m.name && m.home_score != null && m.away_score != null)
  if (full) return { maps, completeness: 'full' }

  return {
    maps,
    completeness: 'partial',
    note: 'Only partial map details were available from the BL API.',
  }
}

export async function getMatchupStats(
  matchupId: number,
  token: string,
): Promise<BLMatchupStats> {
  const raw = await blGet<RawMatchupStats>(
    `/matchup/${matchupId}/stats`,
    token,
    { ttlMs: MATCHUP_STATS_TTL_MS },
  )

  // If the endpoint returns an object with home/away_players already split
  if (!Array.isArray(raw) && raw.home_players && raw.away_players) {
    return {
      matchup_id: raw.matchup_id ?? matchupId,
      home_team: {
        id: raw.home_team?.id ?? 0,
        name: raw.home_team?.name ?? '',
      },
      away_team: {
        id: raw.away_team?.id ?? 0,
        name: raw.away_team?.name ?? '',
      },
      home_players: raw.home_players.map(mapPlayer),
      away_players: raw.away_players.map(mapPlayer),
      total_rounds: raw.total_rounds ?? 0,
    }
  }

  // Flat array response (confirmed shape from Python script)
  // Players carry side ('home'/'away' or similar) — team/signup are null
  const players: RawPlayer[] = Array.isArray(raw)
    ? raw
    : (raw.data ?? [])

  // Group by side value. First distinct side seen = home, second = away.
  // Falls back to team.id if side is absent (future-proofing).
  const sideOrder: (string | number)[] = []
  const sideMap = new Map<string | number, BLPlayerStats[]>()

  for (const p of players) {
    const teamFromNested = p.team ?? p.signup?.team
    const sideKey = p.side ?? teamFromNested?.id ?? 0

    if (!sideMap.has(sideKey)) {
      sideOrder.push(sideKey)
      sideMap.set(sideKey, [])
    }
    sideMap.get(sideKey)!.push(mapPlayer(p))
  }

  const homePlayers = sideMap.get(sideOrder[0]) ?? []
  const awayPlayers = sideMap.get(sideOrder[1]) ?? []

  // total_rounds: all players share rounds_played; use the mode of the home side
  const totalRounds = homePlayers[0]?.rounds ?? awayPlayers[0]?.rounds ?? 0

  return {
    matchup_id: matchupId,
    home_team: { id: 0, name: '' }, // populated by getMatchupMeta in route
    away_team: { id: 0, name: '' },
    home_players: homePlayers,
    away_players: awayPlayers,
    total_rounds: totalRounds,
  }
}

export type MatchupMeta = {
  competitionId: number | null
  bestOf: number | null
  divisionId: number | null
  roundNumber: number | null
  startTime: string | null
  finishedAt: string | null
  homeScore: number | null
  awayScore: number | null
  winner: MatchWinner
  maps: MatchupMapSummary[]
  mapDataCompleteness: 'full' | 'partial' | 'missing'
  mapDataNote?: string
  home: { id: number; name: string; logoUrl?: string }
  away: { id: number; name: string; logoUrl?: string }
  /** paradise_user_id → team id ('home' team id or 'away' team id) */
  playerTeams: Map<number, number>
  /** paradise_user_id → avatar image url */
  playerImages: Map<number, string>
  /** paradise_user_id → Steam64 ID (extracted from matchup_users accounts embed if present) */
  playerSteam64: Map<number, string>
}

/**
 * Fetch rich matchup metadata from /matchup/{id}:
 * - division ID (for fetching historical data)
 * - team names / IDs (from home_signup.team / away_signup.team)
 * - player→team mapping (from matchup_users)
 * - round number
 */
export async function getMatchupMeta(
  matchupId: number,
  token: string,
): Promise<MatchupMeta | null> {
  try {
    const raw = await getRawMatchup(matchupId, token)

    const homeTeam = raw?.home_signup?.team ?? {}
    const awayTeam = raw?.away_signup?.team ?? {}
    const homeLogoUrl = normalizeBlImageUrl(
      homeTeam?.logo?.url,
      homeTeam?.logo?.relative_url,
    )
    const awayLogoUrl = normalizeBlImageUrl(
      awayTeam?.logo?.url,
      awayTeam?.logo?.relative_url,
    )
    const homeTeamId = toOptionalNumber(homeTeam.id) ?? undefined
    const awayTeamId = toOptionalNumber(awayTeam.id) ?? undefined
    const homeScore = toOptionalNumber(raw?.home_score)
    const awayScore = toOptionalNumber(raw?.away_score)
    const competitionId = toOptionalNumber(
      raw?.competition_id ??
      raw?.competition?.id ??
      raw?.matchupable?.competition_id ??
      raw?.matchupable?.competition?.id,
    )
    const winner = parseWinner(
      raw?.winner_id ?? raw?.winner_team_id ?? raw?.winner,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
    )
    const maps = extractMapSummaries(raw, homeTeamId, awayTeamId)

    const playerTeams = new Map<number, number>()
    const playerImages = new Map<number, string>()
    const playerSteam64 = new Map<number, string>()
    const matchupUsers: { user_id?: number; team_id?: number }[] =
      raw?.matchup_users ?? []
    for (const mu of matchupUsers as Array<{
      user_id?: number
      team_id?: number
      user?: {
        image?: { url?: string; relative_url?: string }
        accounts?: Array<{ provider?: string; account_id?: string }>
      }
    }>) {
      if (mu.user_id != null && mu.team_id != null) {
        playerTeams.set(mu.user_id, mu.team_id)
      }
      const avatarUrl = normalizeBlImageUrl(
        mu.user?.image?.url,
        mu.user?.image?.relative_url,
      )
      if (mu.user_id != null && avatarUrl) {
        playerImages.set(mu.user_id, avatarUrl)
      }
      const steamAccount = (mu.user?.accounts ?? []).find(
        (a) => a.provider?.toUpperCase() === 'STEAM',
      )
      if (mu.user_id != null && steamAccount?.account_id) {
        playerSteam64.set(mu.user_id, steamAccount.account_id)
      }
    }

    return {
      competitionId,
      bestOf: toOptionalNumber(raw?.best_of),
      divisionId: raw?.matchupable_id ?? null,
      roundNumber: raw?.round?.number ?? raw?.round_number ?? null,
      startTime: raw?.start_time ?? null,
      finishedAt: raw?.finished_at ?? null,
      homeScore,
      awayScore,
      winner,
      maps: maps.maps,
      mapDataCompleteness: maps.completeness,
      mapDataNote: maps.note,
      home: { id: homeTeam.id ?? 0, name: homeTeam.name ?? '', logoUrl: homeLogoUrl },
      away: { id: awayTeam.id ?? 0, name: awayTeam.name ?? '', logoUrl: awayLogoUrl },
      playerTeams,
      playerImages,
      playerSteam64,
    }
  } catch {
    return null
  }
}

/**
 * Fetch the Steam64 ID for a BL user.
 * The /user/{id} endpoint returns an `accounts` array; STEAM provider entries
 * carry the Steam64 in `account_id`.
 */
export async function getUserSteamId(
  userId: number,
  token: string,
): Promise<string | null> {
  try {
    const raw = await getRawUser(userId, token)
    const accounts: { provider?: string; account_id?: string }[] =
      raw?.accounts ?? []
    const steam = accounts.find(
      (a) => a.provider?.toUpperCase() === 'STEAM',
    )
    return steam?.account_id ?? null
  } catch {
    return null
  }
}

export type TeamPlayerRef = {
  userId: number
  userName: string
  steam64?: string
  avatarUrl?: string
  teamId?: number
  membershipRole?: string
}

type CompetitionLineupEntry = {
  user_id?: number
  role?: string
  status?: string
  active?: boolean
}
function normalizeTeamMembershipRole(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeLineupRole(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}
function isVisibleTeamMembershipRole(role?: string): boolean {
  if (!role) return true

  // Different BL endpoints expose team visibility with different role vocabularies.
  // `/team/{id}/players` has been observed returning `member` / `leader`, while
  // signup-shaped data can use `player` / `substitute`.
  return (
    role === 'player' ||
    role === 'substitute' ||
    role === 'member' ||
    role === 'leader'
  )
}

/**
 * Fetch current team roster with user IDs and linked Steam IDs.
 * Useful as fallback for future matchups where matchup_users is empty.
 */
export async function getTeamPlayers(
  teamId: number,
  token: string,
): Promise<TeamPlayerRef[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/team/${teamId}/players`, token, { ttlMs: TEAM_PLAYERS_TTL_MS })
    const rows: any[] = Array.isArray(raw) ? raw : []
    return rows
      .map((row) => {
        const user = row?.user ?? {}
        const rowTeamId =
          row?.team_id ??
          row?.team?.id ??
          row?.signup?.team?.id
        const membershipRole = normalizeTeamMembershipRole(
          row?.role ??
          row?.team_player_role ??
          row?.signup?.role,
        )
        const accounts: { provider?: string; account_id?: string }[] =
          Array.isArray(user.accounts) ? user.accounts : []
        const steam = accounts.find(
          (a) => a.provider?.toUpperCase() === 'STEAM',
        )?.account_id

        return {
          userId: user.id ?? 0,
          userName: user.user_name ?? '',
          steam64: steam ?? undefined,
          avatarUrl: normalizeBlImageUrl(user?.image?.url, user?.image?.relative_url) ?? undefined,
          teamId: typeof rowTeamId === 'number' ? rowTeamId : undefined,
          membershipRole,
        } satisfies TeamPlayerRef
      })
      .filter((p) => (
        p.userId > 0 &&
        (p.teamId == null || p.teamId === teamId) &&
        (p.membershipRole == null || isVisibleTeamMembershipRole(p.membershipRole))
      ))
  } catch {
    return []
  }
}

/**
 * Fetch competition-scoped team lineup roles (player/substitute).
 */
export async function getCompetitionTeamLineupRoles(
  competitionId: number,
  teamId: number,
  token: string,
): Promise<Map<number, string>> {
  if (!competitionId || !teamId) return new Map()
  try {
    const raw = await blGetLegacy<{ data?: CompetitionLineupEntry[] }>(
      `/competition/${competitionId}/team/${teamId}/lineup`,
      token,
      { ttlMs: COMPETITION_LINEUP_TTL_MS },
    )
    const rows = Array.isArray(raw?.data) ? raw.data : []
    const roles = new Map<number, string>()
    for (const row of rows) {
      const userId = row?.user_id
      if (typeof userId !== 'number' || userId <= 0) continue
      const role = normalizeLineupRole(row?.role)
      if (role) roles.set(userId, role)
    }
    return roles
  } catch {
    return new Map()
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Aggregate an array of per-match BLPlayerStats into one combined record. */
function aggregateStats(stats: BLPlayerStats[]): BLPlayerStats {
  const totalRounds = stats.reduce((s, p) => s + p.rounds, 0)
  return {
    paradise_user_id: stats[0].paradise_user_id,
    name: stats[0].name,
    kills: stats.reduce((s, p) => s + p.kills, 0),
    deaths: stats.reduce((s, p) => s + p.deaths, 0),
    assists: stats.reduce((s, p) => s + p.assists, 0),
    damage: stats.reduce((s, p) => s + p.damage, 0),
    rounds: totalRounds,
    // hs and kast are per-match ratios → weighted average by rounds played
    hs: totalRounds > 0
      ? stats.reduce((s, p) => s + p.hs * p.rounds, 0) / totalRounds
      : 0,
    kast: totalRounds > 0
      ? stats.reduce((s, p) => s + p.kast * p.rounds, 0) / totalRounds
      : 0,
    opening_kills: stats.reduce((s, p) => s + p.opening_kills, 0),
    opening_attempts: stats.reduce((s, p) => s + p.opening_attempts, 0),
  }
}

/**
 * Fetch and aggregate player stats across ALL finished matchups in a division,
 * excluding the target matchup (which is the one being analysed).
 * Returns a map of paradise_user_id → aggregated BLPlayerStats.
 *
 * Parallel-fetches all matchup stats for speed (no rate limit on BL API).
 */
export async function getDivisionPlayerHistory(
  divisionId: number,
  excludeMatchupId: number,
  token: string,
): Promise<Map<number, BLPlayerStats>> {
  const matchups = await getDivisionMatchups(divisionId, token)

  const ids = matchups
    .filter((m) => m.id !== excludeMatchupId && Boolean(m.finished_at))
    .map((m) => m.id)

  if (ids.length === 0) return new Map()

  const results = await Promise.allSettled(
    ids.map((id) => getMatchupStats(id, token)),
  )

  const perPlayer = new Map<number, BLPlayerStats[]>()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { home_players, away_players } = r.value
    for (const p of [...home_players, ...away_players]) {
      if (!perPlayer.has(p.paradise_user_id)) perPlayer.set(p.paradise_user_id, [])
      perPlayer.get(p.paradise_user_id)!.push(p)
    }
  }

  const aggregated = new Map<number, BLPlayerStats>()
  for (const [id, stats] of perPlayer) {
    aggregated.set(id, aggregateStats(stats))
  }
  return aggregated
}

/**
 * Fetch all matchups in a division.
 * Returns the raw array of matchup objects (not typed deeply — used for
 * listing only).
 */
export async function getDivisionMatchups(
  divisionId: number,
  token: string,
): Promise<{ id: number; round_number?: number; finished_at?: string; signups?: unknown[] }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await getRawDivisionMatchups(divisionId, token)) as any[]
}

/**
 * Fetch matchups for a specific BL user.
 * Useful for resolving player-centric pages without guessing the player's team.
 */
export async function getUserMatchups(
  userId: number,
  token: string,
  options?: {
    divisionId?: number
    competitionId?: number
  },
): Promise<Array<{
  id: number
  round_number?: number
  start_time?: string
  finished_at?: string
  signups?: unknown[]
}>> {
  type Raw = { data?: unknown[] } | unknown[]
  const buildParams = (key: 'user_id' | 'paradise_user_id'): string => {
    const params = new URLSearchParams({
      [key]: String(userId),
      limit: '100',
    })
    if (options?.divisionId != null && options.divisionId > 0) {
      params.set('division_id', String(options.divisionId))
    }
    if (options?.competitionId != null && options.competitionId > 0) {
      params.set('competition_id', String(options.competitionId))
    }
    return params.toString()
  }

  for (const key of ['user_id', 'paradise_user_id'] as const) {
    try {
      const data = await blGet<Raw>(
        `/matchup?${buildParams(key)}`,
        token,
      )
      const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
      const filtered = (arr as Array<{ id?: number }>).filter((row) =>
        Number.isInteger(row?.id) && (row?.id ?? 0) > 0,
      )
      if (filtered.length > 0) return filtered as any[]
    } catch {
      // try next key
    }
  }

  return []
}

export type CompetitionDivision = {
  id: number
  name: string
  competition_id: number
}

export type CompetitionSummary = {
  id: number
  name: string
  starts_at?: string | null
  ends_at?: string | null
  status?: string | null
}

export type CompetitionSignupTeam = {
  competition_id: number
  team_id: number
  team_name: string
}

export async function getCompetitions(
  token: string,
): Promise<CompetitionSummary[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>('/competition?limit=100&game_id=1', token, { ttlMs: COMPETITIONS_TTL_MS })
    const arr: any[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return arr
      .filter((competition) => competition?.id != null)
      .map((competition) => ({
        id: competition.id,
        name: competition.name ?? `Competition ${competition.id}`,
        starts_at:
          competition.starts_at ??
          competition.start_time ??
          competition.start_at ??
          null,
        ends_at:
          competition.ends_at ??
          competition.end_time ??
          competition.finished_at ??
          null,
        status: competition.status ?? null,
      }))
  } catch {
    return []
  }
}

export async function getCompetitionSignupTeams(
  competitionId: number,
  token: string,
): Promise<CompetitionSignupTeam[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(
      `/competition/${competitionId}/signups?limit=200`,
      token,
      { ttlMs: COMPETITION_SIGNUPS_TTL_MS },
    )
    const arr: any[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return arr
      .map((signup) => {
        const teamId =
          signup?.team?.id ??
          signup?.signupable?.id ??
          signup?.team_id
        const teamName =
          signup?.team?.name ??
          signup?.signupable?.name ??
          signup?.name

        if (!Number.isInteger(teamId) || typeof teamName !== 'string' || teamName.trim() === '') {
          return null
        }

        return {
          competition_id: competitionId,
          team_id: teamId,
          team_name: teamName.trim(),
        } satisfies CompetitionSignupTeam
      })
      .filter((team): team is CompetitionSignupTeam => team != null)
  } catch {
    return []
  }
}

/**
 * Fetch all divisions for a competition.
 * Used to power the division picker on the landing page.
 */
export async function getCompetitionDivisions(
  competitionId: number,
  token: string,
): Promise<CompetitionDivision[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(
      `/competition/${competitionId}/divisions`,
      token,
      { ttlMs: COMPETITION_DIVISIONS_TTL_MS },
    )
    const arr: any[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return arr
      .filter((d) => d?.id != null)
      .map((d) => ({
        id: d.id,
        name: d.name ?? `Division ${d.id}`,
        competition_id: competitionId,
      }))
  } catch {
    return []
  }
}

/**
 * Fetch division matchups with team-side information.
 * Returns the home/away team IDs for each matchup so callers can determine
 * which stats belong to which team without fetching full matchup metadata.
 */
export async function getDivisionMatchupsWithTeamSides(
  divisionId: number,
  token: string,
): Promise<Array<{
  id: number
  homeTeamId?: number
  awayTeamId?: number
  finishedAt?: string | null
}>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((await getRawDivisionMatchups(divisionId, token)) as any[])
    .filter((m) => Number.isInteger(m?.id) && (m?.id ?? 0) > 0)
    .map((m) => ({
      id: m.id as number,
      homeTeamId: m?.home_signup?.team?.id ?? undefined,
      awayTeamId: m?.away_signup?.team?.id ?? undefined,
      finishedAt: m?.finished_at ?? null,
    }))
}

/**
 * Fetch the avatar image URL for a BL user.
 * Uses /user/{id} which returns the user's image object.
 */
export async function getUserImageUrl(
  userId: number,
  token: string,
): Promise<string | undefined> {
  try {
    const raw = await getRawUser(userId, token)
    return normalizeBlImageUrl(raw?.image?.url, raw?.image?.relative_url) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Fetch the team ID for a BL user from their active signup.
 * Returns null if the user has no team or on any error.
 */
export async function getUserTeamId(
  userId: number,
  token: string,
): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/user/${userId}`, token)
    const teamId =
      raw?.signup?.team?.id ??
      raw?.team?.id ??
      raw?.signups?.[0]?.team?.id ??
      null
    return typeof teamId === 'number' ? teamId : null
  } catch {
    return null
  }
}

/**
 * Fetch basic team metadata (name, logo).
 * Returns null on any error — the caller falls back to data extracted from matchup metadata.
 */
export async function getTeamInfo(
  teamId: number,
  token: string,
): Promise<{ name: string; logoUrl?: string } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/team/${teamId}`, token)
    const name = raw?.name ?? raw?.team_name ?? ''
    if (!name) return null
    const logoUrl = normalizeBlImageUrl(raw?.logo?.url, raw?.logo?.relative_url) ?? undefined
    return { name, logoUrl }
  } catch {
    return null
  }
}

/**
 * Fetch map pick/ban veto data for a matchup.
 * Returns null on any error — veto data is optional enrichment.
 */
export async function getMatchupVeto(
  matchupId: number,
  token: string,
): Promise<{ picks?: Array<{ map: string; team_id: number }>; bans?: Array<{ map: string; team_id: number }> } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/matchup/${matchupId}/veto`, token)
    if (!raw) return null
    return {
      picks: Array.isArray(raw.picks) ? raw.picks : undefined,
      bans: Array.isArray(raw.bans) ? raw.bans : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Fetch division standings/table.
 * Returns null on any error — table data is optional enrichment.
 */
export async function getDivisionTable(
  divisionId: number,
  token: string,
): Promise<unknown | null> {
  try {
    return await blGet<unknown>(`/division/${divisionId}/tables`, token)
  } catch {
    return null
  }
}

/**
 * Fetch matchup_users for a specific matchup.
 * Returns all checked-in players with their team assignment and avatar URL.
 * Only populated for completed matchups — upcoming matches return [].
 */
export async function getMatchupTeamPlayers(
  matchupId: number,
  token: string,
): Promise<Array<{ userId: number; teamId: number; userName?: string; avatarUrl?: string }>> {
  try {
    const raw = await getRawMatchup(matchupId, token)
    const users: Array<{
      user_id?: number
      team_id?: number
      user?: { user_name?: string; image?: { url?: string; relative_url?: string } }
    }> = raw?.matchup_users ?? []
    return users
      .filter((u) => u?.user_id != null && u?.team_id != null)
      .map((u) => ({
        userId: u.user_id!,
        teamId: u.team_id!,
        userName: u.user?.user_name,
        avatarUrl: normalizeBlImageUrl(u.user?.image?.url, u.user?.image?.relative_url) ?? undefined,
      }))
  } catch {
    return []
  }
}

/**
 * Fetch matchup listing for a team across competitions/seasons.
 */
export async function getTeamMatchups(
  teamId: number,
  token: string,
): Promise<{
  id: number
  round_number?: number
  start_time?: string
  finished_at?: string
  signups?: unknown[]
}[]> {
  type Raw = { data?: unknown[] } | unknown[]
  const data = await blGet<Raw>(
    `/matchup?team_id=${teamId}&limit=100`,
    token,
    { ttlMs: TEAM_MATCHUPS_TTL_MS },
  )
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr as any[]
}

/**
 * Fetch matchup listing for a specific user (paradise_user_id).
 * Tries `/matchup?user_id={userId}` — returns [] on any error.
 * When successful, also extracts the player's team ID from the first matchup.
 */
async function fetchMatchupListByParam(
  param: string,
  token: string,
): Promise<{ id: number; finished_at?: string | null; matchup_users?: unknown[]; home_signup?: unknown; away_signup?: unknown }[]> {
  type Raw = { data?: unknown[] } | unknown[]
  const data = await blGet<Raw>(`/matchup?${param}&limit=100`, token)
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (arr as any[]).filter((m) => Number.isInteger(m?.id) && (m?.id ?? 0) > 0)
}

/**
 * Fetch matchup listing for a specific user (paradise_user_id).
 * Tries `user_id` and `paradise_user_id` query params — returns empty on any error.
 * Also extracts the player's team ID from matchup_users when available.
 */
export async function getPlayerMatchupsAndTeamId(
  userId: number,
  token: string,
): Promise<{
  matchups: { id: number; finished_at?: string | null }[]
  teamId: number | null
}> {
  let rawMatchups: { id: number; finished_at?: string | null; matchup_users?: unknown[]; home_signup?: unknown; away_signup?: unknown }[] = []

  // Try user_id param first, then paradise_user_id
  for (const param of [`user_id=${userId}`, `paradise_user_id=${userId}`]) {
    try {
      const result = await fetchMatchupListByParam(param, token)
      if (result.length > 0) {
        rawMatchups = result
        break
      }
    } catch {
      // try next
    }
  }

  if (rawMatchups.length === 0) return { matchups: [], teamId: null }

  const matchups = rawMatchups.map((m) => ({
    id: m.id,
    finished_at: (m?.finished_at ?? null) as string | null,
  }))

  // Extract team ID from matchup_users of the first finished matchup
  const firstFinished = rawMatchups.find((m) => m?.finished_at)
  let teamId: number | null = null
  if (firstFinished) {
    const mu = Array.isArray(firstFinished.matchup_users) ? firstFinished.matchup_users : []
    const userRow = (mu as { user_id?: number; team_id?: number }[]).find((u) => u?.user_id === userId)
    if (userRow?.team_id) {
      teamId = userRow.team_id
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = (firstFinished.home_signup as any)?.team?.id ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = (firstFinished.away_signup as any)?.team?.id ?? null
      teamId = home ?? away
    }
  }

  return { matchups, teamId }
}
