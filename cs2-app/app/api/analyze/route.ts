import { NextRequest, NextResponse } from 'next/server'
import { getMatchupStats, getMatchupTeamNames } from '@/lib/bl-api'
import { fetchProfiles } from '@/lib/leetify-api'
import { buildPlayerAnalysis } from '@/lib/aggregation'
import { STEAM_BY_USER_ID } from '@/lib/players'
import type { AnalyzeResponse, AnalyzeError } from '@/lib/types'

export const maxDuration = 90

export async function GET(request: NextRequest) {
  const start = Date.now()
  const matchupIdParam = request.nextUrl.searchParams.get('matchup_id')

  const matchupId = Number(matchupIdParam)
  if (!matchupIdParam || !Number.isInteger(matchupId) || matchupId <= 0) {
    return NextResponse.json<AnalyzeError>(
      { error: 'matchup_id must be a positive integer' },
      { status: 400 }
    )
  }
  const blToken = process.env.BL_TOKEN
  const leetifyToken = process.env.LEETIFY_TOKEN

  if (!blToken || !leetifyToken) {
    return NextResponse.json<AnalyzeError>(
      { error: 'BL_TOKEN and LEETIFY_TOKEN must be set in .env.local' },
      { status: 500 }
    )
  }

  // 1. Fetch BL match stats
  let matchupStats
  try {
    matchupStats = await getMatchupStats(matchupId, blToken)
  } catch (err) {
    return NextResponse.json<AnalyzeError>(
      { error: `Failed to fetch matchup ${matchupId}: ${err}`, matchup_id: matchupId },
      { status: 502 }
    )
  }

  // 1b. Best-effort: fetch team names (not available from /stats endpoint)
  const teamNames = await getMatchupTeamNames(matchupId, blToken)

  // 2. Collect Steam IDs for Leetify
  const allPlayers = [...matchupStats.home_players, ...matchupStats.away_players]
  const steamIds = allPlayers
    .map((p) => STEAM_BY_USER_ID[p.paradise_user_id])
    .filter((s): s is string => Boolean(s))

  // 3. Fetch Leetify profiles (rate-limited, sequential) — failures are non-fatal
  let leetifyProfiles: Awaited<ReturnType<typeof fetchProfiles>>
  try {
    leetifyProfiles = await fetchProfiles(steamIds, leetifyToken)
  } catch {
    console.warn('Leetify fetch failed entirely, proceeding with BL-only data')
    leetifyProfiles = new Map()
  }

  // 4. Build player analyses
  const analyze = (players: typeof matchupStats.home_players) =>
    players.map((p) => {
      const steam64 = STEAM_BY_USER_ID[p.paradise_user_id]
      const leetify = steam64 ? leetifyProfiles.get(steam64) : undefined
      return buildPlayerAnalysis(p, steam64, leetify)
    })

  const response: AnalyzeResponse = {
    matchup_id: matchupId,
    teams: {
      home: {
        id: teamNames?.home.id ?? matchupStats.home_team.id,
        name: teamNames?.home.name ?? matchupStats.home_team.name,
        players: analyze(matchupStats.home_players),
      },
      away: {
        id: teamNames?.away.id ?? matchupStats.away_team.id,
        name: teamNames?.away.name ?? matchupStats.away_team.name,
        players: analyze(matchupStats.away_players),
      },
    },
    meta: {
      rounds_fetched: matchupStats.total_rounds,
      leetify_count: leetifyProfiles.size,
      data_sources: steamIds.length > 0 ? ['BL API', 'Leetify'] : ['BL API'],
      fetched_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
    },
  }

  return NextResponse.json(response)
}
