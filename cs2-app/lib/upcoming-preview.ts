import { analyzeMatchup } from '@/lib/analyze-service'
import type { AnalyzeResponse } from '@/lib/types'

export type UpcomingMatchPreview = {
  homeWinPct: number
  awayWinPct: number
  confidenceLabel: string
  confidenceClass: string
  bestMap?: string
  cautionMap?: string
  homeKeyPlayer?: string
  awayKeyPlayer?: string
}

type CachedUpcomingPreview = {
  value: UpcomingMatchPreview | null
  expiresAt: number
}

const UPCOMING_PREVIEW_TTL_MS = 15 * 60 * 1000
const upcomingPreviewCache = new Map<number, CachedUpcomingPreview>()
const upcomingPreviewInflight = new Map<number, Promise<UpcomingMatchPreview | null>>()

function formatMapName(map: string): string {
  const normalized = map.replace(/^de_/, '')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function buildUpcomingPreview(result: AnalyzeResponse): UpcomingMatchPreview | null {
  const landing = result.landing
  if (!landing) return null

  const bestMap = landing.map_battlefield?.maps
    .slice()
    .sort((a, b) => {
      const aEdge = Math.abs((a.home_win_rate ?? 0.5) - (a.away_win_rate ?? 0.5))
      const bEdge = Math.abs((b.home_win_rate ?? 0.5) - (b.away_win_rate ?? 0.5))
      return bEdge - aEdge
    })[0]
  const cautionMap = landing.map_battlefield?.maps
    .filter((map) => map.favored !== 'even')
    .slice()
    .sort((a, b) => {
      const aEdge = Math.abs((a.home_win_rate ?? 0.5) - (a.away_win_rate ?? 0.5))
      const bEdge = Math.abs((b.home_win_rate ?? 0.5) - (b.away_win_rate ?? 0.5))
      return bEdge - aEdge
    })[1]

  const confidence = landing.reliability.low_sample || landing.reliability.high_uncertainty
    ? {
      label: 'Tynn data',
      cls: 'text-warning border-warning/30 bg-warning/8',
    }
    : {
      label: 'OK grunnlag',
      cls: 'text-success border-success/30 bg-success/8',
    }

  return {
    homeWinPct: landing.tactical_edge.home_win_pct,
    awayWinPct: landing.tactical_edge.away_win_pct,
    confidenceLabel: confidence.label,
    confidenceClass: confidence.cls,
    bestMap: bestMap ? formatMapName(bestMap.map) : undefined,
    cautionMap: cautionMap ? formatMapName(cautionMap.map) : undefined,
    homeKeyPlayer: landing.watchlist?.home.initiators[0]?.name ?? result.teams.home.players[0]?.name,
    awayKeyPlayer: landing.watchlist?.away.initiators[0]?.name ?? result.teams.away.players[0]?.name,
  }
}

export async function getUpcomingPreview(matchupId: number): Promise<UpcomingMatchPreview | null> {
  const cached = upcomingPreviewCache.get(matchupId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const inflight = upcomingPreviewInflight.get(matchupId)
  if (inflight) return inflight

  const request = analyzeMatchup(matchupId)
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
