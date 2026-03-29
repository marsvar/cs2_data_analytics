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
  // team info may be nested
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
  // Players carry team info via .team or .signup.team
  const players: RawPlayer[] = Array.isArray(raw)
    ? raw
    : (raw.data ?? [])

  // Group by team
  const teamMap = new Map<number, { name: string; players: BLPlayerStats[] }>()
  for (const p of players) {
    const team = p.team ?? p.signup?.team
    const teamId = team?.id ?? 0
    const teamName = team?.name ?? ''
    if (!teamMap.has(teamId)) {
      teamMap.set(teamId, { name: teamName, players: [] })
    }
    teamMap.get(teamId)!.players.push(mapPlayer(p))
  }

  const teams = [...teamMap.entries()]
  const [homeEntry, awayEntry] = [teams[0], teams[1]]

  return {
    matchup_id: matchupId,
    home_team: {
      id: homeEntry?.[0] ?? 0,
      name: homeEntry?.[1].name ?? '',
    },
    away_team: {
      id: awayEntry?.[0] ?? 0,
      name: awayEntry?.[1].name ?? '',
    },
    home_players: homeEntry?.[1].players ?? [],
    away_players: awayEntry?.[1].players ?? [],
    total_rounds: 0, // not available from flat stats endpoint
  }
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
