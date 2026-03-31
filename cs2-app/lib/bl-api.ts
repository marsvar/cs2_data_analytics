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

const BL_BASE = 'https://app.bedriftsligaen.no/api/paradise/v2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function blGet<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${BL_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`BL API ${res.status}: ${endpoint}`)
  return res.json() as Promise<T>
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
  opening_duels_won?: number
  opening_duels_lost?: number
  firstkills?: number
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
  }
}

export async function getMatchupStats(
  matchupId: number,
  token: string,
): Promise<BLMatchupStats> {
  const raw = await blGet<RawMatchupStats>(
    `/matchup/${matchupId}/stats`,
    token,
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
  divisionId: number | null
  roundNumber: number | null
  startTime: string | null
  finishedAt: string | null
  home: { id: number; name: string }
  away: { id: number; name: string }
  /** paradise_user_id → team id ('home' team id or 'away' team id) */
  playerTeams: Map<number, number>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/matchup/${matchupId}`, token)

    const homeTeam = raw?.home_signup?.team ?? {}
    const awayTeam = raw?.away_signup?.team ?? {}

    const playerTeams = new Map<number, number>()
    const matchupUsers: { user_id?: number; team_id?: number }[] =
      raw?.matchup_users ?? []
    for (const mu of matchupUsers) {
      if (mu.user_id != null && mu.team_id != null) {
        playerTeams.set(mu.user_id, mu.team_id)
      }
    }

    return {
      divisionId: raw?.matchupable_id ?? null,
      roundNumber: raw?.round?.number ?? raw?.round_number ?? null,
      startTime: raw?.start_time ?? null,
      finishedAt: raw?.finished_at ?? null,
      home: { id: homeTeam.id ?? 0, name: homeTeam.name ?? '' },
      away: { id: awayTeam.id ?? 0, name: awayTeam.name ?? '' },
      playerTeams,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await blGet<any>(`/user/${userId}`, token)
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
    const raw = await blGet<any>(`/team/${teamId}/players`, token)
    const rows: any[] = Array.isArray(raw) ? raw : []
    return rows
      .map((row) => {
        const user = row?.user ?? {}
        const accounts: { provider?: string; account_id?: string }[] =
          Array.isArray(user.accounts) ? user.accounts : []
        const steam = accounts.find(
          (a) => a.provider?.toUpperCase() === 'STEAM',
        )?.account_id

        return {
          userId: user.id ?? 0,
          userName: user.user_name ?? '',
          steam64: steam ?? undefined,
        } satisfies TeamPlayerRef
      })
      .filter((p) => p.userId > 0)
  } catch {
    return []
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
  type Raw = { data?: unknown[] } | unknown[]
  const data = await blGet<Raw>(
    `/matchup?division_id=${divisionId}&limit=100`,
    token,
  )
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr as any[]
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
  )
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return arr as any[]
}
