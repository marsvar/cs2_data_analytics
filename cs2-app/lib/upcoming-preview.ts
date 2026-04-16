import { analyzeMatchup } from '@/lib/analyze-service'
import type { AnalyzeResponse } from '@/lib/types'

export type UpcomingMatchPreview = {
  homeTeam: string
  awayTeam: string
  homeWinPct: number
  awayWinPct: number
  confidenceNote?: string
  confidenceLabel: string
  confidenceClass: string
  homeKeyPlayer?: string
  awayKeyPlayer?: string
  homeKeyPlayerAvatarUrl?: string
  awayKeyPlayerAvatarUrl?: string
}

type CachedUpcomingPreview = {
  value: UpcomingMatchPreview | null
  expiresAt: number
}

const UPCOMING_PREVIEW_TTL_MS = 15 * 60 * 1000
const upcomingPreviewCache = new Map<number, CachedUpcomingPreview>()
const upcomingPreviewInflight = new Map<number, Promise<UpcomingMatchPreview | null>>()

export function buildUpcomingPreview(result: AnalyzeResponse): UpcomingMatchPreview | null {
  const landing = result.landing
  if (!landing) return null
  const homeKeyPlayer =
    landing.watchlist?.home.initiators[0]?.name ?? result.teams.home.players[0]?.name
  const awayKeyPlayer =
    landing.watchlist?.away.initiators[0]?.name ?? result.teams.away.players[0]?.name
  const homeKeyPlayerAvatarUrl = result.teams.home.players.find((player) => player.name === homeKeyPlayer)?.avatar_url
  const awayKeyPlayerAvatarUrl = result.teams.away.players.find((player) => player.name === awayKeyPlayer)?.avatar_url

  const confidence = landing.reliability.low_sample || landing.reliability.high_uncertainty
    ? {
      label: 'Thin data',
      cls: 'text-warning border-warning/30 bg-warning/8',
    }
    : {
      label: 'Solid read',
      cls: 'text-success border-success/30 bg-success/8',
    }

  return {
    homeTeam: result.teams.home.name,
    awayTeam: result.teams.away.name,
    homeWinPct: landing.tactical_edge.home_win_pct,
    awayWinPct: landing.tactical_edge.away_win_pct,
    confidenceNote: landing.tactical_edge.confidence_note,
    confidenceLabel: confidence.label,
    confidenceClass: confidence.cls,
    homeKeyPlayer,
    awayKeyPlayer,
    homeKeyPlayerAvatarUrl,
    awayKeyPlayerAvatarUrl,
  }
}

export async function getUpcomingPreview(matchupId: number): Promise<UpcomingMatchPreview | null> {
  const cached = upcomingPreviewCache.get(matchupId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const inflight = upcomingPreviewInflight.get(matchupId)
  if (inflight) return inflight

  const request = analyzeMatchup(matchupId, { includeLeetify: false })
    .then((result) => {
      const preview = buildUpcomingPreview(result)
      upcomingPreviewCache.set(matchupId, {
        value: preview,
        expiresAt: Date.now() + UPCOMING_PREVIEW_TTL_MS,
      })
      return preview
    })
    .finally(() => {
      upcomingPreviewInflight.delete(matchupId)
    })

  upcomingPreviewInflight.set(matchupId, request)
  return request
}
