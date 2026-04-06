'use client'

import Link from 'next/link'
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import { formatReport } from '@/lib/format-report'
import { deriveLandingAnalytics } from '@/lib/landing-analytics'
import { localMapImageForName } from '@/lib/map-images'
import { detectRole, ROLE_META } from '@/lib/detect-role'
import { AnalysisSection } from '@/components/analysis-section'
import { HeadToHeadBar } from '@/components/head-to-head-bar'
import { PlayerAvatar, TeamLogo } from './identity-badge'
import { MapPoolDebugPanel } from './map-pool-insights'
import { PlayerDetail } from './player-detail'
import { UpcomingMatchModules } from './upcoming-match-modules'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-success)'
  if (score >= 0.5) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function confidenceFromSample(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 20) return 'high'
  if (sampleSize >= 8) return 'medium'
  return 'low'
}

function formatSigned(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

const osloDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatOsloDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return osloDateTimeFormatter.format(parsed)
}

type LandingMapPool = NonNullable<NonNullable<AnalyzeResponse['landing']>['map_pool']>
type VetoHint = NonNullable<LandingMapPool['veto_hint']>

function deriveBo3VetoHint(
  activeMaps: string[],
  homeMaps: LandingMapPool['home']['maps'],
  awayMaps: LandingMapPool['away']['maps'],
): VetoHint | undefined {
  const minSample = 8
  const homeByMap = new Map(homeMaps.map((map) => [map.map, map]))
  const awayByMap = new Map(awayMaps.map((map) => [map.map, map]))

  const edgeForTeam = (
    team: { win_rate: number; sample_size: number } | undefined,
    opp: { win_rate: number; sample_size: number } | undefined,
  ): number => {
    if (team && opp) return team.win_rate - opp.win_rate
    if (team && !opp) {
      const sampleFactor = Math.min(team.sample_size / minSample, 1)
      return (team.win_rate - 0.5) * 0.6 * sampleFactor
    }
    if (!team && opp) {
      const sampleFactor = Math.min(opp.sample_size / minSample, 1)
      return (0.5 - opp.win_rate) * 0.6 * sampleFactor
    }
    return 0
  }

  const states = activeMaps.map((map) => {
    const home = homeByMap.get(map)
    const away = awayByMap.get(map)
    const homeSample = home?.sample_size ?? 0
    const awaySample = away?.sample_size ?? 0
    return {
      map,
      home,
      away,
      homeEdge: edgeForTeam(home, away),
      awayEdge: edgeForTeam(away, home),
      homeSample,
      awaySample,
      combinedSample: homeSample + awaySample,
    }
  })

  const hasSignal = states.some((s) => s.homeSample >= minSample || s.awaySample >= minSample)
  if (!hasSignal) return undefined

  const byMap = new Map(states.map((s) => [s.map, s]))
  const remaining = new Set(activeMaps)

  const choosePick = (team: 'home' | 'away') => {
    const sorted = Array.from(remaining)
      .map((map) => byMap.get(map))
      .filter((state): state is NonNullable<typeof state> => state != null)
      .sort((a, b) => {
        const aEdge = team === 'home' ? a.homeEdge : a.awayEdge
        const bEdge = team === 'home' ? b.homeEdge : b.awayEdge
        if (bEdge !== aEdge) return bEdge - aEdge
        const aSample = team === 'home' ? a.homeSample : a.awaySample
        const bSample = team === 'home' ? b.homeSample : b.awaySample
        if (bSample !== aSample) return bSample - aSample
        if (b.combinedSample !== a.combinedSample) return b.combinedSample - a.combinedSample
        return a.map.localeCompare(b.map)
      })
    return sorted[0]?.map
  }

  const chooseBan = (team: 'home' | 'away') => {
    const sorted = Array.from(remaining)
      .map((map) => byMap.get(map))
      .filter((state): state is NonNullable<typeof state> => state != null)
      .sort((a, b) => {
        const aEdge = team === 'home' ? a.homeEdge : a.awayEdge
        const bEdge = team === 'home' ? b.homeEdge : b.awayEdge
        if (aEdge !== bEdge) return aEdge - bEdge
        const aOppSample = team === 'home' ? a.awaySample : a.homeSample
        const bOppSample = team === 'home' ? b.awaySample : b.homeSample
        if (bOppSample !== aOppSample) return bOppSample - aOppSample
        if (b.combinedSample !== a.combinedSample) return b.combinedSample - a.combinedSample
        return a.map.localeCompare(b.map)
      })
    return sorted[0]?.map
  }

  const take = (map: string | undefined): string | undefined => {
    if (!map || !remaining.has(map)) return undefined
    remaining.delete(map)
    return map
  }

  const result: VetoHint = {
    suggested_ban1_for_home: take(chooseBan('home')),
    suggested_ban1_for_away: take(chooseBan('away')),
    suggested_pick_for_home: take(choosePick('home')),
    suggested_pick_for_away: take(choosePick('away')),
    suggested_ban2_for_home: take(chooseBan('home')),
    suggested_ban2_for_away: take(chooseBan('away')),
    decider_map: Array.from(remaining)[0],
  }

  result.avoid_for_home = result.suggested_ban1_for_home
  result.avoid_for_away = result.suggested_ban1_for_away

  return Object.values(result).some(Boolean) ? result : undefined
}

// ── Data source badge ──────────────────────────────────────────────────────────

function DataBadge({ source }: { source: PlayerAnalysis['data_source'] }) {
  const config: Record<PlayerAnalysis['data_source'], { label: string; cls: string }> = {
    bl: { label: 'BL', cls: 'bg-accent/20 text-accent' },
    leetify: { label: 'L', cls: 'bg-success/20 text-success' },
    combined: { label: 'BL+L', cls: 'bg-purple-500/20 text-purple-300' },
  }
  const { label, cls } = config[source]
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
  )
}

function TrendBadge({ player }: { player: PlayerAnalysis }) {
  if (player.leetify_prior == null) return null

  const delta = player.score - player.leetify_prior
  const deltaLabel = `${delta > 0 ? '+' : ''}${(delta * 10).toFixed(1)}`

  if (delta > 0.05) {
    return (
      <span
        className="text-[8px] font-mono text-success tabular-nums border border-success/35 bg-success/10 rounded px-1 py-px shrink-0"
        title={`Over karrieresnitt (${deltaLabel})`}
      >
        ↑ {deltaLabel}
      </span>
    )
  }
  if (delta < -0.05) {
    return (
      <span
        className="text-[8px] font-mono text-danger tabular-nums border border-danger/35 bg-danger/10 rounded px-1 py-px shrink-0"
        title={`Under karrieresnitt (${deltaLabel})`}
      >
        ↓ {deltaLabel}
      </span>
    )
  }
  return (
    <span
      className="text-[8px] font-mono text-muted tabular-nums border border-border/45 bg-surface2/55 rounded px-1 py-px shrink-0"
      title="On par with career average"
    >
      → 0.0
    </span>
  )
}

type PlayerEarlyInsight = {
  paradise_user_id: number
  name: string
  blended_od: number
  bl_od?: number
  leetify_od?: number
  source: 'BL' | 'L' | 'BL+L'
  rounds: number
}

type PlayerFormInsight = {
  paradise_user_id: number
  name: string
  delta: number
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function edgeDirection(delta: number, homeLabel: string, awayLabel: string): string {
  if (Math.abs(delta) < 0.0001) return 'Even'
  return delta > 0 ? homeLabel : awayLabel
}

function toScaledDelta(value: number): string {
  const scaled = value * 10
  return `${scaled >= 0 ? '+' : ''}${scaled.toFixed(2)}`
}

function relativeShareBand(homeValue: number, awayValue: number): { home: number; away: number } {
  const safeHome = Math.max(homeValue, 0)
  const safeAway = Math.max(awayValue, 0)
  const total = safeHome + safeAway
  if (total <= 0) return { home: 50, away: 50 }
  const home = (safeHome / total) * 100
  return { home, away: 100 - home }
}

function computePlayerEarlyInsights(players: PlayerAnalysis[]): PlayerEarlyInsight[] {
  const insights: PlayerEarlyInsight[] = []
  for (const player of players) {
    const blOd = Number.isFinite(player.od_rate) ? player.od_rate : undefined
    const leetifyOd = player.leetify
      ? (player.leetify.ct_od + player.leetify.t_od) / 2
      : undefined

    const blended =
      blOd != null && leetifyOd != null
        ? blOd * 0.65 + leetifyOd * 0.35
        : blOd ?? leetifyOd

    if (blended == null) continue

    insights.push({
      paradise_user_id: player.paradise_user_id,
      name: player.name,
      blended_od: blended,
      bl_od: blOd,
      leetify_od: leetifyOd,
      source: blOd != null && leetifyOd != null ? 'BL+L' : blOd != null ? 'BL' : 'L',
      rounds: player.rounds,
    })
  }
  return insights
}

function weightedTeamEarlyOd(players: PlayerEarlyInsight[]): number {
  if (players.length === 0) return 0.5

  let weightedSum = 0
  let totalWeight = 0
  for (const player of players) {
    const weight = Math.max(20, Math.min(player.rounds, 400))
    weightedSum += player.blended_od * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0.5
}

function computeFormInsights(players: PlayerAnalysis[]): PlayerFormInsight[] {
  return players
    .filter((player) => player.leetify_prior != null)
    .map((player) => ({
      paradise_user_id: player.paradise_user_id,
      name: player.name,
      delta: player.score - (player.leetify_prior ?? player.score),
    }))
}

function strongestAndWeakest(
  players: PlayerEarlyInsight[],
): { strengths: PlayerEarlyInsight[]; weaknesses: PlayerEarlyInsight[] } {
  if (players.length === 0) return { strengths: [], weaknesses: [] }

  const sorted = [...players].sort((a, b) => b.blended_od - a.blended_od)
  const strengths = sorted.slice(0, Math.min(2, sorted.length))

  const weaknesses: PlayerEarlyInsight[] = []
  for (let i = sorted.length - 1; i >= 0 && weaknesses.length < 2; i -= 1) {
    const candidate = sorted[i]
    if (strengths.some((player) => player.paradise_user_id === candidate.paradise_user_id)) {
      continue
    }
    weaknesses.push(candidate)
  }

  return { strengths, weaknesses }
}

function EarlyStrengthCard({
  title,
  accentClass,
  players,
}: {
  title: string
  accentClass: string
  players: PlayerEarlyInsight[]
}) {
  const { strengths, weaknesses } = useMemo(() => strongestAndWeakest(players), [players])
  const openingBand = (od: number) => {
    const centered = Math.max(-1, Math.min(1, (od - 0.5) / 0.15))
    return { positive: centered >= 0, width: Math.abs(centered) * 50 }
  }

  return (
    <div className="rounded border border-border/35 bg-surface2/20 p-3">
      <p className={`font-mono text-[11px] mb-2 ${accentClass}`}>{title}</p>

      <div className="space-y-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-success/70 mb-1.5">Strongest in opening</p>
          {strengths.length > 0 ? (
            <div className="space-y-1.5">
              {strengths.map((player) => {
                const od = player.blended_od
                const band = openingBand(od)
                return (
                  <div key={`strength-${player.paradise_user_id}`} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text truncate flex-1">{player.name}</span>
                    <div className="relative h-2 w-16 overflow-hidden rounded-full bg-surface shrink-0">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
                      {band.positive ? (
                        <div className="absolute inset-y-0 left-1/2 rounded-r-full bg-success/70" style={{ width: `${band.width}%` }} />
                      ) : (
                        <div className="absolute inset-y-0 right-1/2 rounded-l-full bg-danger/70" style={{ width: `${band.width}%` }} />
                      )}
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-success w-9 text-right shrink-0">{toPercent(od)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-muted">Ingen data.</p>
          )}
        </div>

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-danger/70 mb-1.5">Svakest i opening</p>
          {weaknesses.length > 0 ? (
            <div className="space-y-1.5">
              {weaknesses.map((player) => {
                const od = player.blended_od
                const band = openingBand(od)
                return (
                  <div key={`weakness-${player.paradise_user_id}`} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text truncate flex-1">{player.name}</span>
                    <div className="relative h-2 w-16 overflow-hidden rounded-full bg-surface shrink-0">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
                      {band.positive ? (
                        <div className="absolute inset-y-0 left-1/2 rounded-r-full bg-success/70" style={{ width: `${band.width}%` }} />
                      ) : (
                        <div className="absolute inset-y-0 right-1/2 rounded-l-full bg-danger/70" style={{ width: `${band.width}%` }} />
                      )}
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-danger w-9 text-right shrink-0">{toPercent(od)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-muted">Ingen tydelig svakhet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function FormGraph({
  title,
  accentClass,
  data,
}: {
  title: string
  accentClass: string
  data: PlayerFormInsight[]
}) {
  const maxAbs = 0.12

  const teamAvg = useMemo(() => {
    if (data.length === 0) return 0
    const total = data.reduce((sum, player) => sum + player.delta, 0)
    return total / data.length
  }, [data])

  return (
    <div className="rounded border border-border/35 bg-surface2/20 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className={`font-mono text-[11px] ${accentClass}`}>{title}</p>
        <span className="font-mono text-[10px] tabular-nums text-muted">
          Snitt: <span className={teamAvg >= 0 ? 'text-success' : 'text-danger'}>{toScaledDelta(teamAvg)}</span>
        </span>
      </div>

      {data.length === 0 ? (
        <p className="font-mono text-[10px] text-muted">Missing Leetify data to compute form deviation.</p>
      ) : (
        <div className="space-y-1.5">
          {data.map((player) => {
            const pct = (Math.abs(player.delta) / maxAbs) * 50
            const positive = player.delta >= 0
            return (
              <div key={player.paradise_user_id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[10px] text-text truncate">{player.name}</span>
                <div className="relative flex-1 h-3 rounded bg-surface/70 overflow-hidden border border-border/30">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
                  <div
                    className={`absolute top-0 h-full ${positive ? 'bg-success/70 left-1/2' : 'bg-danger/70 left-1/2'}`}
                    style={
                      positive
                        ? { width: `${pct}%` }
                        : { width: `${pct}%`, transform: 'translateX(-100%)' }
                    }
                  />
                </div>
                <span className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${positive ? 'text-success' : 'text-danger'}`}>
                  {toScaledDelta(player.delta)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EarlyRoundAndFormPanel({
  home,
  away,
  landing,
  usingLiveLineup,
}: {
  home: Team
  away: Team
  landing?: AnalyzeResponse['landing']
  usingLiveLineup: boolean
}) {
  const homeEarly = useMemo(() => computePlayerEarlyInsights(home.players), [home.players])
  const awayEarly = useMemo(() => computePlayerEarlyInsights(away.players), [away.players])
  const homeForm = useMemo(() => computeFormInsights(home.players), [home.players])
  const awayForm = useMemo(() => computeFormInsights(away.players), [away.players])

  const homeTeamOd = weightedTeamEarlyOd(homeEarly)
  const awayTeamOd = weightedTeamEarlyOd(awayEarly)
  const edgeDelta = homeTeamOd - awayTeamOd

  const sourceLabel = landing?.early_round_edge.source === 'combined'
    ? 'BL + Leetify'
    : landing?.early_round_edge.source === 'leetify'
      ? 'Leetify'
      : 'BL'

  return (
    <AnalysisSection
      title="Opening Duels & Form"
      description="This section drills down to the player level. It shows who most often wins first contact, and who is currently playing above or below their own baseline."
      className="mt-6 mb-6 border-border/45 bg-surface p-4"
      headerRight={(
        <div className="flex items-center gap-2 shrink-0">
          {usingLiveLineup && (
            <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-accent/40 bg-accent/10 text-accent px-2 py-1">
              Live lineup
            </span>
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-border/40 text-muted/70 px-2 py-1">
            {sourceLabel}
          </span>
        </div>
      )}
    >

      <div className="rounded-lg border border-border/30 bg-surface2/15 p-3 mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50">
            Team-weighted opening duel rate
          </p>
          <span className={`font-mono text-[9px] ${
            Math.abs(edgeDelta) < 0.03 ? 'text-muted' : edgeDelta > 0 ? 'text-accent' : 'text-accent2'
          }`}>
            {Math.abs(edgeDelta * 100) < 3
              ? 'Likt fordelt'
              : `${edgeDelta > 0 ? home.name || 'Home' : away.name || 'Away'} +${Math.abs(edgeDelta * 100).toFixed(1)} pp`}
          </span>
        </div>
        <HeadToHeadBar
          homeShare={homeTeamOd * 100}
          awayShare={awayTeamOd * 100}
          homeLabel={`${home.name || 'Home'} ${toPercent(homeTeamOd)}`}
          awayLabel={`${toPercent(awayTeamOd)} ${away.name || 'Away'}`}
          centerLabel="weighted opening"
        />
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-border/30 bg-surface2/15 p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-1.5">Hva du ser her</p>
          <p className="font-mono text-[11px] text-text/90">
            The opening section is player-focused and shows who most often makes first contact. It supplements
            <span className="text-text"> Pre-match Control</span>, which already covers trade, survival and entry pressure at the team level.
          </p>
        </div>
        <div className="rounded-lg border border-border/30 bg-surface2/15 p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-1.5">Formlesning</p>
          <p className="font-mono text-[11px] text-text/90">
            The form graph shows deviation from the Leetify baseline. A positive value means the player enters the match above their normal level; a negative value means the profile is colder than usual.
          </p>
        </div>
      </div>

      {/* Per-player opening duel breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-2 px-0.5">
            {home.name || 'Home'} · Opening duels per player
          </p>
            <EarlyStrengthCard title={home.name || 'Home'} accentClass="text-accent" players={homeEarly} />
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-2 px-0.5">
            {away.name || 'Away'} · Opening duels per player
          </p>
            <EarlyStrengthCard title={away.name || 'Away'} accentClass="text-accent2" players={awayEarly} />
        </div>
      </div>

      {/* Form vs career baseline */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-2 px-0.5">
          Form vs career average (Leetify) — positive means above normal level
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FormGraph title={home.name || 'Home'} accentClass="text-accent" data={homeForm} />
          <FormGraph title={away.name || 'Away'} accentClass="text-accent2" data={awayForm} />
        </div>
      </div>
    </AnalysisSection>
  )
}

// ── Expandable player row ──────────────────────────────────────────────────────

function PlayerRow({
  player,
  matchStatus,
  tone,
}: {
  player: PlayerAnalysis
  matchStatus: AnalyzeResponse['meta']['match_status']
  tone: 'home' | 'away'
}) {
  const [expanded, setExpanded] = useState(false)
  const displayScore = (player.score * 10).toFixed(2)
  const displayCI = player.ci.toFixed(2)
  const role = detectRole(player)
  const roleMeta = role ? ROLE_META[role] : null

  const hasCTT = player.leetify != null
  const ctPct = player.leetify ? Math.round(player.leetify.ct_od * 100) : null
  const tPct = player.leetify ? Math.round(player.leetify.t_od * 100) : null

  return (
    <div className="border-b border-border/25 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2 px-1 -mx-1 rounded-sm hover:bg-surface2/60 transition-colors text-left cursor-pointer"
        aria-expanded={expanded}
        aria-controls={`detail-${player.paradise_user_id}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-muted/50 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path
            d="M3 2L7 5L3 8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="flex flex-col min-w-0 w-36 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerAvatar
              name={player.name}
              imageUrl={player.avatar_url}
              tone={tone}
              size="xs"
            />
            <Link
              href={`/player/${player.paradise_user_id}`}
              className="font-mono text-xs text-text hover:text-accent hover:underline underline-offset-2 truncate transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {player.name}
            </Link>
            <TrendBadge player={player} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {roleMeta && (
              <span className={`text-[8px] font-mono ${roleMeta.colorClass}`} title={roleMeta.desc}>
                {roleMeta.label}
              </span>
            )}
            {hasCTT && ctPct != null && tPct != null && (
              <span className="text-[8px] font-mono text-muted/60 tabular-nums" title="CT/T OD% (Leetify matchmaking)">
                CT{ctPct}%·T{tPct}%
              </span>
            )}
          </div>
        </div>

        <div className="relative flex-1 h-1 bg-surface2 rounded-full mx-2">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${player.score * 100}%`,
              background: scoreColor(player.score),
              transition: 'width 400ms ease',
            }}
          />
        </div>

        <span
          className="w-20 shrink-0 font-mono text-xs text-right tabular-nums"
          style={{ color: scoreColor(player.score) }}
        >
          {displayScore}{' '}
          <span className="text-muted text-[10px]">±{displayCI}</span>
        </span>

        <div className="w-12 shrink-0 flex justify-end">
          <DataBadge source={player.data_source} />
        </div>
      </button>

      <div
        id={`detail-${player.paradise_user_id}`}
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 250ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="px-3 pt-3 pb-4 my-1 mx-1 rounded-md bg-surface2/30 border border-border/20">
            <PlayerDetail player={player} matchStatus={matchStatus} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────────

function TeamCard({
  team,
  accent,
  matchStatus,
}: {
  team: Team
  accent: 'accent' | 'accent2'
  matchStatus: AnalyzeResponse['meta']['match_status']
}) {
  const sorted = useMemo(
    () => [...team.players].sort((a, b) => b.score - a.score),
    [team.players],
  )
  const stats = useMemo(() => deriveTeamStats(team.players), [team.players])

  const headerColor = accent === 'accent' ? 'text-accent' : 'text-accent2'
  const borderColor = accent === 'accent' ? 'border-accent/25' : 'border-accent2/25'
  const tone: 'home' | 'away' = accent === 'accent' ? 'home' : 'away'

  return (
    <div className={`bg-surface rounded-lg border ${borderColor} p-4`}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className={`font-display text-sm tracking-widest uppercase ${headerColor} flex items-center gap-2`}>
          <TeamLogo
            name={team.name || 'Team'}
            logoUrl={team.logo_url}
            tone={tone}
            size="md"
          />
          {team.name || 'Team'}
        </h2>
        <span className="font-mono text-[10px] text-muted tabular-nums">
          ⌀{' '}
          <span style={{ color: scoreColor(stats.avg_score) }}>
            {(stats.avg_score * 10).toFixed(1)}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1 px-5">
        <span className="w-36 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest">
          Player
        </span>
        <span className="flex-1 mx-2 text-[9px] font-mono text-muted uppercase tracking-widest">
          Rating
        </span>
        <span className="w-20 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest text-right">
          Score ±CI
        </span>
        <span className="w-12 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest text-right">
          Source
        </span>
      </div>

      <div>
        {sorted.map((p) => (
          <PlayerRow
            key={p.paradise_user_id}
            player={p}
            matchStatus={matchStatus}
            tone={tone}
          />
        ))}
      </div>
    </div>
  )
}

// ── Meta bar ───────────────────────────────────────────────────────────────────

function MetaBar({ meta }: { meta: AnalyzeResponse['meta'] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-mono text-muted bg-surface rounded-md px-4 py-2.5 border border-border/40 mb-6">
      <span>
        <span className="text-text/70">Status</span>{' '}
        <span className="tabular-nums">{meta.match_status === 'played' ? 'Played' : 'Upcoming'}</span>
      </span>
      <span>
        <span className="text-text/70">Rounds</span>{' '}
        <span className="tabular-nums">{meta.rounds_fetched}</span>
      </span>
      <span title={meta.leetify_count === 0 && meta.leetify_attempts > 0 ? '404 — no Leetify profiles found for these players' : undefined}>
        <span className="text-text/70">Leetify</span>{' '}
        <span className={`tabular-nums ${meta.leetify_count === 0 && meta.leetify_attempts > 0 ? 'text-warning' : ''}`}>
          {meta.leetify_count}/{meta.leetify_attempts}
        </span>
      </span>
      <span>
        <span className="text-text/70">Kilder</span>{' '}
        {meta.data_sources.join(', ')}
      </span>
      <span className="ml-auto tabular-nums text-muted/50">
        {meta.duration_ms}ms
      </span>
    </div>
  )
}

function CopyReportButton({ result }: { result: AnalyzeResponse }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(formatReport(result))
      setState('copied')
      window.setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      window.setTimeout(() => setState('idle'), 2500)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copyReport}
        className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border border-border/50 bg-surface hover:bg-surface2/50 transition-colors"
        title="Kopier analyse som tekst"
      >
        {state === 'copied' ? 'Kopiert' : state === 'error' ? 'Feilet' : 'Kopier analyse'}
      </button>
      <span aria-live="polite" className="font-mono text-[9px] text-muted h-3">
        {state === 'copied'
          ? 'Analyse kopiert til utklippstavle.'
          : state === 'error'
            ? 'Kunne ikke kopiere. Sjekk nettleser-tilgang til utklippstavle.'
            : ''}
      </span>
    </div>
  )
}

function teamLabel(result: AnalyzeResponse, side: 'home' | 'away'): string {
  return side === 'home'
    ? (result.teams.home.name || 'Home')
    : (result.teams.away.name || 'Away')
}

function winnerLabel(result: AnalyzeResponse, winner?: 'home' | 'away' | 'draw' | 'unknown'): string {
  const resolved = winner ?? result.result_summary?.winner ?? 'unknown'
  if (resolved === 'home') return teamLabel(result, 'home')
  if (resolved === 'away') return teamLabel(result, 'away')
  if (resolved === 'draw') return 'Draw'
  return 'Unknown'
}

function signed(value: number, suffix = ''): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function boLabel(result: AnalyzeResponse): string {
  const fromNote = result.maps_played?.note?.match(/BO(\d+)/i)
  if (fromNote) return `BO${fromNote[1]}`

  const homeWins = result.result_summary?.home_score ?? 0
  const awayWins = result.result_summary?.away_score ?? 0
  const maxWins = Math.max(homeWins, awayWins)
  if (maxWins >= 3) return 'BO5'
  if (maxWins >= 2) return 'BO3'
  if (maxWins >= 1) return 'BO1'

  const mapCount = result.maps_played?.maps.length ?? 0
  if (mapCount >= 5) return 'BO5'
  if (mapCount >= 3) return 'BO3'
  if (mapCount > 0) return 'BO1'
  return 'BO?'
}

function completenessBadgeClass(completeness: 'full' | 'partial' | 'missing'): string {
  if (completeness === 'full') return 'border-success/40 text-success bg-success/10'
  if (completeness === 'partial') return 'border-warning/40 text-warning bg-warning/10'
  return 'border-border/40 text-muted bg-surface2/40'
}

function mapWinnerFromScore(
  home?: number | null,
  away?: number | null,
): 'home' | 'away' | 'draw' | 'unknown' {
  if (home == null || away == null) return 'unknown'
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function winnerBadgeClass(side: 'home' | 'away' | 'draw' | 'unknown'): string {
  if (side === 'home') return 'border-accent/45 text-accent bg-accent/10'
  if (side === 'away') return 'border-accent2/45 text-accent2 bg-accent2/10'
  if (side === 'draw') return 'border-warning/45 text-warning bg-warning/10'
  return 'border-border/40 text-muted bg-surface2/50'
}

function trendBadgeClass(trend: 'overperforming' | 'underperforming' | 'stable'): string {
  if (trend === 'overperforming') return 'border-success/45 text-success bg-success/10'
  if (trend === 'underperforming') return 'border-danger/45 text-danger bg-danger/10'
  return 'border-border/45 text-muted bg-surface2/40'
}

function mapSurfaceStyle(name: string | undefined, imageUrl: string | undefined): CSSProperties {
  if (imageUrl) {
    const safeUrl = encodeURI(imageUrl).replace(/"/g, '\\"')
    return {
      backgroundImage: `linear-gradient(to top, rgba(7,10,15,0.86), rgba(7,10,15,0.40)), url("${safeUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }

  const seed = (name ?? 'map')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360
  return {
    backgroundImage: `linear-gradient(140deg, hsl(${seed} 58% 22%), hsl(${(seed + 46) % 360} 64% 16%))`,
  }
}

/** @deprecated use MetricBar */
function EdgeMeter({
  label,
  value,
  maxAbs,
  suffix = '',
}: {
  label: string
  value: number
  maxAbs: number
  suffix?: string
}) {
  const width = Math.min(Math.abs(value) / maxAbs, 1) * 50
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] text-muted">{label}</span>
        <span className={`font-mono text-[10px] tabular-nums ${value >= 0 ? 'text-accent' : 'text-accent2'}`}>
          {signed(value, suffix)}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-surface">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/80" />
        {value >= 0 ? (
          <div
            className="absolute top-0 bottom-0 left-1/2 rounded-r-full bg-accent/80"
            style={{ width: `${width}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 right-1/2 rounded-l-full bg-accent2/80"
            style={{ width: `${width}%` }}
          />
        )}
      </div>
    </div>
  )
}

// ── New visualization components ───────────────────────────────────────────────

/**
 * Two-sided metric bar with team labels and significant-edge threshold marker.
 * Positive value → home (accent/blue) wins. Negative → away (accent2/orange) wins.
 */
function MetricBar({
  label,
  tooltip: tooltipText,
  value,
  maxAbs,
  suffix = '',
  homeVal,
  awayVal,
  homeLogo,
  awayLogo,
  homeLabel,
  awayLabel,
  dim = false,
}: {
  label: string
  tooltip?: string
  value: number
  maxAbs: number
  suffix?: string
  homeVal?: string
  awayVal?: string
  homeLogo?: string
  awayLogo?: string
  homeLabel?: string
  awayLabel?: string
  dim?: boolean
}) {
  if (!Number.isFinite(value)) return null
  const pct = Math.min(Math.abs(value) / maxAbs, 1) * 50
  const isHome = value >= 0
  const sigThresholdPct = 50 * 0.33
  const hasActualVals = homeVal != null && awayVal != null

  // Bar fills toward the WINNING team's side.
  // Home is left, away is right — winner's fill extends outward from center toward them.
  const barTrack = (
    <div className="relative h-2.5 rounded-full bg-surface overflow-hidden">
      <div className="absolute top-0 bottom-0 w-px bg-border/60 z-10" style={{ left: `${50 - sigThresholdPct}%` }} />
      <div className="absolute top-0 bottom-0 w-px bg-border/60 z-10" style={{ left: `${50 + sigThresholdPct}%` }} />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
      {isHome
        ? <div className="absolute inset-y-0 left-0 right-1/2 bg-accent/5" />
        : <div className="absolute inset-y-0 left-1/2 right-0 bg-accent2/5" />}
      {isHome ? (
        <div
          className="absolute top-0 bottom-0 right-1/2 rounded-l-full bg-gradient-to-l from-accent/60 to-accent transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div
          className="absolute top-0 bottom-0 left-1/2 rounded-r-full bg-gradient-to-r from-accent2/60 to-accent2 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )

  const teamIcon = (logoUrl: string | undefined, side: 'home' | 'away') =>
    logoUrl
      ? <img src={logoUrl} alt="" className="w-4 h-4 rounded object-contain bg-surface2 shrink-0" />
      : <div className={`w-2 h-2 rounded-full shrink-0 ${side === 'home' ? 'bg-accent' : 'bg-accent2'}`} />

  const barEl = (
    <div className={`space-y-1 ${dim ? 'opacity-65' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted">{label}</span>
        {hasActualVals ? (
          <span className={`font-mono text-[10px] tabular-nums ${isHome ? 'text-accent/80' : 'text-accent2/80'}`}>
            Δ {Math.abs(value).toFixed(1)}
          </span>
        ) : (
          <span className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${isHome ? 'text-accent' : 'text-accent2'}`}>
            {signed(value, suffix)}
          </span>
        )}
      </div>

      {hasActualVals ? (
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Home: icon + value */}
          <div className="flex items-center gap-1 min-w-[52px]">
            {teamIcon(homeLogo, 'home')}
            <span className={`font-mono text-[11px] font-semibold tabular-nums leading-none ${isHome ? 'text-accent' : 'text-muted/60'}`}>
              {homeVal}
            </span>
          </div>
          <div className="flex-1">{barTrack}</div>
          {/* Away: value + icon */}
          <div className="flex items-center gap-1 justify-end min-w-[52px]">
            <span className={`font-mono text-[11px] font-semibold tabular-nums leading-none ${!isHome ? 'text-accent2' : 'text-muted/60'}`}>
              {awayVal}
            </span>
            {teamIcon(awayLogo, 'away')}
          </div>
        </div>
      ) : (
        <>
          {barTrack}
          {(homeLabel || awayLabel || homeLogo || awayLogo) && (
            <div className="flex justify-between font-mono leading-none mt-0.5">
              <div className="flex items-center gap-1">
                {homeLogo && <img src={homeLogo} alt="" className="w-3 h-3 rounded object-contain shrink-0" />}
                {homeLabel && <span className={`text-[9px] ${isHome ? 'text-accent/80' : 'text-muted/50'} truncate max-w-[45%]`}>{homeLabel}</span>}
              </div>
              <div className="flex items-center gap-1 justify-end">
                {awayLabel && <span className={`text-[9px] ${!isHome ? 'text-accent2/80' : 'text-muted/50'} truncate max-w-[45%] text-right`}>{awayLabel}</span>}
                {awayLogo && <img src={awayLogo} alt="" className="w-3 h-3 rounded object-contain shrink-0" />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  if (!tooltipText) return barEl
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">{barEl}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-[10px] font-mono bg-surface2 border-border text-text">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Small badge showing which team won the most sub-metrics in a section.
 * Pass an array of signed values: positive = home wins that metric.
 */
function SectionWinner({
  values,
  homeLabel,
  awayLabel,
}: {
  values: (number | undefined)[]
  homeLabel: string
  awayLabel: string
}) {
  const defined = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (defined.length === 0) return null
  const homeWins = defined.filter((v) => v > 0).length
  const awayWins = defined.filter((v) => v < 0).length
  const total = defined.length

  if (homeWins === awayWins) {
    return (
      <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-widest text-muted border-border/50 px-1.5 py-0.5 h-auto rounded">
        Even
      </Badge>
    )
  }
  const winner = homeWins > awayWins
  const label = winner ? homeLabel : awayLabel
  const wins = winner ? homeWins : awayWins
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 h-auto rounded ${
        winner
          ? 'text-accent border-accent/50 bg-accent/10'
          : 'text-accent2 border-accent2/50 bg-accent2/10'
      }`}
    >
      {wins}/{total} {label} ▲
    </Badge>
  )
}

/** Shown when a section has no usable data from the BL API. */
function DataQualityNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
      <span className="text-warning text-[11px] leading-none mt-0.5">⚠</span>
      <p className="font-mono text-[10px] text-warning/80">{message}</p>
    </div>
  )
}

function PostMatchReport({ result }: { result: AnalyzeResponse }) {
  const resultSummary = result.result_summary
  const mapsPlayed = result.maps_played
  const post = result.post_analysis
  const homePlayers = result.teams.home.players
  const awayPlayers = result.teams.away.players
  const playerByTeamAndName = (team: 'home' | 'away', name: string): PlayerAnalysis | undefined => {
    const pool = team === 'home' ? homePlayers : awayPlayers
    return pool.find((player) => player.name === name)
  }
  const seriesDecidedEarly = Boolean(
    mapsPlayed?.note?.toLowerCase().includes('serien allerede var avgjort'),
  )
  const completeness = mapsPlayed?.completeness ?? 'missing'
  const completionLabel =
    completeness === 'full' ? 'Full data' : completeness === 'partial' ? 'Partial data' : 'Missing data'
  const scoreLabel = (
    resultSummary?.home_score != null &&
    resultSummary?.away_score != null
  )
    ? `${resultSummary.home_score}-${resultSummary.away_score}`
    : 'Unknown'
  const finishedLabel = resultSummary?.finished_at
    ? formatOsloDateTime(resultSummary.finished_at)
    : 'Unknown time'

  return (
    <section className="mb-6 rounded-xl border border-accent/30 bg-gradient-to-b from-surface to-surface2/15 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="font-display text-[10px] uppercase tracking-widest text-accent">Post-match Analysis</h3>
        <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-accent/40 text-accent bg-accent/10 px-2 py-1.5">
          Played match
        </span>
      </div>

      <div className="rounded-xl border border-border/40 bg-gradient-to-br from-surface2/55 via-surface to-surface p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Result & match context</p>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className={`font-mono text-[9px] uppercase tracking-widest rounded border px-2 py-1.5 ${completenessBadgeClass(completeness)}`}>
              {completionLabel}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-border/40 text-muted px-2 py-1.5">
              {boLabel(result)}
            </span>
            <span className={`font-mono text-[9px] uppercase tracking-widest rounded border px-2 py-1.5 ${winnerBadgeClass(resultSummary?.winner ?? 'unknown')}`}>
              {winnerLabel(result)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:justify-start justify-center min-w-0">
            <TeamLogo
              name={teamLabel(result, 'home')}
              logoUrl={result.teams.home.logo_url}
              tone="home"
              size="sm"
            />
            <p className="font-mono text-xs text-accent truncate">{teamLabel(result, 'home')}</p>
          </div>
          <div className="text-center">
            <p className="font-display text-3xl md:text-4xl tabular-nums text-success leading-none">{scoreLabel}</p>
            <p className="font-mono text-[10px] text-muted mt-1">Sluttresultat</p>
          </div>
          <div className="flex items-center gap-2 sm:justify-end justify-center min-w-0">
            <p className="font-mono text-xs text-accent2 truncate">{teamLabel(result, 'away')}</p>
            <TeamLogo
              name={teamLabel(result, 'away')}
              logoUrl={result.teams.away.logo_url}
              tone="away"
              size="sm"
            />
          </div>
        </div>
        <p className="mt-3 font-mono text-[10px] text-muted tabular-nums">
          Finished: {finishedLabel}
        </p>
      </div>

      <div className="rounded-xl border border-border/35 bg-surface2/20 p-3 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">Map story</p>
        {mapsPlayed ? (
          <>
            <p className="font-mono text-[11px] text-text mb-2">
              Maps spilt: <span className="tabular-nums">{mapsPlayed.total_maps}</span> / {mapsPlayed.maps.length || mapsPlayed.total_maps}{' '}
              <span className="text-muted">({mapsPlayed.completeness})</span>
            </p>
            {mapsPlayed.maps.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {mapsPlayed.maps.map((map, i) => {
                  const mapWinner = mapWinnerFromScore(map.home_score, map.away_score)
                  const mapPlayed = map.home_score != null && map.away_score != null
                  const imageUrl = localMapImageForName(map.name) ?? map.image_url

                  return (
                    <div
                      key={`${map.name ?? 'map'}-${i}`}
                      className={`rounded-xl border p-3 min-h-[162px] flex flex-col justify-between overflow-hidden relative ${winnerBadgeClass(mapWinner)}`}
                      style={mapSurfaceStyle(map.name, imageUrl)}
                    >
                      <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                      <div className="relative z-10 flex items-start justify-between gap-2">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-muted/90 border border-border/40 bg-surface/40 rounded px-1.5 py-0.5">
                          Map {i + 1}
                        </span>
                        {!mapPlayed && (
                          <span className="font-mono text-[8px] uppercase tracking-widest text-muted border border-border/40 bg-surface/45 rounded px-1.5 py-0.5">
                            Ikke spilt
                          </span>
                        )}
                        {mapPlayed && (
                          <span className={`font-mono text-[8px] uppercase tracking-widest rounded border px-1.5 py-0.5 ${winnerBadgeClass(mapWinner)}`}>
                            {winnerLabel(result, mapWinner)}
                          </span>
                        )}
                      </div>

                      <div className="relative z-10 mt-2">
                        <div className="font-mono text-[12px] text-text">
                          {map.name ?? `Map ${i + 1}`}
                        </div>
                        {map.source === 'derived' && (
                          <span className="inline-block mt-1 font-mono text-[8px] uppercase tracking-widest text-muted border border-border/40 rounded px-1 py-0.5 bg-surface/40">
                            Est.
                          </span>
                        )}
                      </div>

                      <div className="relative z-10 space-y-1 mt-2">
                        {mapPlayed ? (
                          <>
                            <div className="inline-flex items-baseline gap-1 font-display text-2xl tabular-nums text-text bg-surface/45 rounded px-2 py-1 leading-none">
                              {map.home_score}-{map.away_score}
                            </div>
                            <div className={`font-mono text-[9px] uppercase tracking-widest ${mapWinner === 'home' ? 'text-accent' : mapWinner === 'away' ? 'text-accent2' : 'text-warning'}`}>
                              Vinner: {winnerLabel(result, mapWinner)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-mono text-[11px] text-muted tabular-nums">Ikke spilt</div>
                            <div className="font-mono text-[9px] text-muted/80">
                              {seriesDecidedEarly ? 'Serien var allerede avgjort.' : 'Ingen score registrert.'}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="font-mono text-[11px] text-muted">Ingen map-liste tilgjengelig for denne kampen.</p>
            )}
            {mapsPlayed.note && (
              <p className={`font-mono text-[10px] mt-2 ${seriesDecidedEarly ? 'text-muted' : 'text-warning'}`}>
                {mapsPlayed.note}
              </p>
            )}
          </>
        ) : (
          <p className="font-mono text-[11px] text-muted">Map-detaljer mangler i responsen.</p>
        )}
      </div>

      {post && (() => {
        const hl = teamLabel(result, 'home')
        const al = teamLabel(result, 'away')

        // ── Team-level stat averages ───────────────────────────────────────
        // Computes a simple mean across players; skips nulls and NaN.
        // teamAvgStat returns 0 on no data; teamAvgOrNull returns null.
        const teamAvgStat = (
          players: PlayerAnalysis[],
          fn: (p: PlayerAnalysis) => number | null | undefined,
        ): number => {
          const vals = players.map(fn).filter((v): v is number => v != null && Number.isFinite(v))
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
        }
        const teamAvgOrNull = (
          players: PlayerAnalysis[],
          fn: (p: PlayerAnalysis) => number | null | undefined,
        ): number | null => {
          const vals = players.map(fn).filter((v): v is number => v != null && Number.isFinite(v))
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
        }

        // Core per-team stats (used across MetricBars and radar)
        const homeODpct   = teamAvgStat(result.teams.home.players, (p) => p.od_rate * 100)
        const awayODpct   = teamAvgStat(result.teams.away.players, (p) => p.od_rate * 100)
        const homeKASTpct = teamAvgStat(result.teams.home.players, (p) => p.kast * 100)
        const awayKASTpct = teamAvgStat(result.teams.away.players, (p) => p.kast * 100)
        const homeDPRraw  = teamAvgStat(result.teams.home.players, (p) => p.dpr)
        const awayDPRraw  = teamAvgStat(result.teams.away.players, (p) => p.dpr)
        // DPR: normalise against 120 dmg/round ceiling so all radar axes share 0–100 scale
        const homeDPRn    = Math.min(homeDPRraw / 120 * 100, 100)
        const awayDPRn    = Math.min(awayDPRraw / 120 * 100, 100)

        // BL-extended stats (null when bl_extended not populated)
        const homeSurvPct     = teamAvgOrNull(result.teams.home.players, (p) => p.bl_extended?.survival_ratio != null ? p.bl_extended.survival_ratio * 100 : null)
        const awaySurvPct     = teamAvgOrNull(result.teams.away.players, (p) => p.bl_extended?.survival_ratio != null ? p.bl_extended.survival_ratio * 100 : null)
        const homeTradeK100   = teamAvgOrNull(result.teams.home.players, (p) => p.bl_extended?.trade_kills != null && p.rounds > 0 ? p.bl_extended.trade_kills / p.rounds * 100 : null)
        const awayTradeK100   = teamAvgOrNull(result.teams.away.players, (p) => p.bl_extended?.trade_kills != null && p.rounds > 0 ? p.bl_extended.trade_kills / p.rounds * 100 : null)
        const homeTradeD100   = teamAvgOrNull(result.teams.home.players, (p) => p.bl_extended?.traded_deaths != null && p.rounds > 0 ? p.bl_extended.traded_deaths / p.rounds * 100 : null)
        const awayTradeD100   = teamAvgOrNull(result.teams.away.players, (p) => p.bl_extended?.traded_deaths != null && p.rounds > 0 ? p.bl_extended.traded_deaths / p.rounds * 100 : null)
        const homeAssistPR    = teamAvgStat(result.teams.home.players, (p) => p.rounds > 0 ? p.assists / p.rounds : null)
        const awayAssistPR    = teamAvgStat(result.teams.away.players, (p) => p.rounds > 0 ? p.assists / p.rounds : null)
        const homeKASTSurvGap = homeSurvPct != null ? homeSurvPct - homeKASTpct : null
        const awayKASTSurvGap = awaySurvPct != null ? awaySurvPct - awayKASTpct : null

        // Team logos for MetricBar icons
        const homeLogo = result.teams.home.logo_url
        const awayLogo = result.teams.away.logo_url

        // ── Radar chart configs ────────────────────────────────────────────
        const tacticalChartConfig: ChartConfig = {
          home: { label: hl, color: 'var(--color-accent)' },
          away: { label: al, color: 'var(--color-accent2)' },
        }

        type RadarRow = { metric: string; home: number; away: number; homeLabel: string; awayLabel: string }
        const tacticalData: RadarRow[] = [
          {
            metric: 'OD %',
            home: homeODpct,   away: awayODpct,
            homeLabel: `${homeODpct.toFixed(1)}%`, awayLabel: `${awayODpct.toFixed(1)}%`,
          },
          {
            metric: 'KAST %',
            home: homeKASTpct, away: awayKASTpct,
            homeLabel: `${homeKASTpct.toFixed(1)}%`, awayLabel: `${awayKASTpct.toFixed(1)}%`,
          },
          {
            metric: 'DPR',
            home: homeDPRn,    away: awayDPRn,
            homeLabel: homeDPRraw.toFixed(1), awayLabel: awayDPRraw.toFixed(1),
          },
        ]

        // Round Stability: edge-based (survival is patchy; edge is more reliable here)
        const toRadar = (edge: number, maxAbsEdge: number) =>
          Math.max(20, Math.min(80, 50 + (edge / maxAbsEdge) * 30))

        const stabilityData = post.round_stability ? [
          {
            metric: 'KAST',
            home: toRadar(post.round_stability.indicators.kast_edge_pp, 20),
            away: toRadar(-post.round_stability.indicators.kast_edge_pp, 20),
          },
          ...(post.round_stability.indicators.survival_edge_pp != null &&
            Number.isFinite(post.round_stability.indicators.survival_edge_pp) ? [{
            metric: 'Survival',
            home: toRadar(post.round_stability.indicators.survival_edge_pp, 20),
            away: toRadar(-post.round_stability.indicators.survival_edge_pp, 20),
          }] : []),
          ...(post.round_stability.indicators.survival_minus_kast_edge_pp != null &&
            Number.isFinite(post.round_stability.indicators.survival_minus_kast_edge_pp) ? [{
            metric: 'Surv−KAST',
            home: toRadar(post.round_stability.indicators.survival_minus_kast_edge_pp, 12),
            away: toRadar(-post.round_stability.indicators.survival_minus_kast_edge_pp, 12),
          }] : []),
        ] : []

        type LegacyLateRound = NonNullable<AnalyzeResponse['post_analysis']>['late_round_conversion'] & {
          indicators?: {
            clutch_edge_per_map?: number
            one_v_x_edge?: number
            explosive_round_edge?: number
          }
        }
        const rawLateRound = post.late_round_conversion
        const legacyLateRound = post.late_round_conversion as LegacyLateRound | undefined
        const lateRoundMetrics = rawLateRound?.metrics ?? (
          legacyLateRound?.indicators
            ? {
              clutch_wins_per_map: legacyLateRound.indicators.clutch_edge_per_map != null
                ? {
                  home: 0,
                  away: 0,
                  edge: legacyLateRound.indicators.clutch_edge_per_map,
                }
                : undefined,
              one_v_x_wins_per_map: legacyLateRound.indicators.one_v_x_edge != null
                ? {
                  home: 0,
                  away: 0,
                  edge: legacyLateRound.indicators.one_v_x_edge,
                }
                : undefined,
              explosive_rounds_per_map: legacyLateRound.indicators.explosive_round_edge != null
                ? {
                  home: 0,
                  away: 0,
                  edge: legacyLateRound.indicators.explosive_round_edge,
                }
                : undefined,
            }
            : undefined
        )

        // Support both the new `metrics` shape and older cached `indicators` responses.
        const lateRoundHasData = [
          lateRoundMetrics?.clutch_wins_per_map,
          lateRoundMetrics?.one_v_x_wins_per_map,
          lateRoundMetrics?.explosive_rounds_per_map,
        ].some((metric) => metric != null)

        const isRelativeDev = post.player_development.focus_players[0]?.is_relative ?? false
        const isRatingDev = post.player_development.focus_players[0]?.metric === 'bl_rating'

        return (
          <div className="space-y-3">

            {/* ── 1. Tactical Control ────────────────────────────────────── */}
            <div className="rounded-xl border border-border/35 bg-surface2/20 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Tactical Control</p>
                <SectionWinner
                  values={[
                    post.tactical_control.opening_duel_edge_pp,
                    post.tactical_control.stability_edge_kast_pp,
                    post.tactical_control.pressure_edge_dpr,
                  ]}
                  homeLabel={hl}
                  awayLabel={al}
                />
              </div>
              <p className="font-mono text-[11px] text-text mb-3">{post.tactical_control.summary}</p>

              {/* Radar chart — actual per-team values */}
              <ChartContainer config={tacticalChartConfig} className="h-[180px] w-full mb-3">
                <RadarChart data={tacticalData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="rgba(42,48,68,0.6)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name={hl}
                    dataKey="home"
                    stroke="var(--color-accent)"
                    fill="var(--color-accent)"
                    fillOpacity={0.22}
                    strokeWidth={1.5}
                  />
                  <Radar
                    name={al}
                    dataKey="away"
                    stroke="var(--color-accent2)"
                    fill="var(--color-accent2)"
                    fillOpacity={0.18}
                    strokeWidth={1.5}
                  />
                  <ChartTooltip
                    content={({ payload, label }) => {
                      if (!payload?.length) return null
                      const row = tacticalData.find((d) => d.metric === label)
                      if (!row) return null
                      return (
                        <div className="rounded border border-border/50 bg-surface2 px-2.5 py-1.5 font-mono text-[10px] shadow-lg">
                          <p className="text-muted mb-1">{label}</p>
                          <p className="text-accent">{hl}: {row.homeLabel}</p>
                          <p className="text-accent2">{al}: {row.awayLabel}</p>
                        </div>
                      )
                    }}
                  />
                </RadarChart>
              </ChartContainer>

              {/* Metric bars under chart */}
              <div className="space-y-2.5 rounded-lg border border-border/25 bg-surface/40 p-2.5">
                <MetricBar
                  label="Opening Duel"
                  tooltip="Opening duel win rate. Winning first kill usually controls 70-80% of rounds."
                  value={post.tactical_control.opening_duel_edge_pp}
                  maxAbs={15}
                  homeVal={`${homeODpct.toFixed(1)}%`}
                  awayVal={`${awayODpct.toFixed(1)}%`}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
                <MetricBar
                  label="KAST"
                  tooltip="Kill/Assist/Survived/Traded per round. More stable than K/D in small samples."
                  value={post.tactical_control.stability_edge_kast_pp}
                  maxAbs={20}
                  homeVal={`${homeKASTpct.toFixed(1)}%`}
                  awayVal={`${awayKASTpct.toFixed(1)}%`}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
                <MetricBar
                  label="Damage Per Round"
                  tooltip="DPR edge. High DPR pushes opponents into force-buys and weaker economy rounds."
                  value={post.tactical_control.pressure_edge_dpr}
                  maxAbs={20}
                  homeVal={homeDPRraw.toFixed(1)}
                  awayVal={awayDPRraw.toFixed(1)}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
              </div>
              {/* Role impact */}
              {post.tactical_control.role_impact.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/25 space-y-2">
                  {post.tactical_control.role_impact.map((impact, idx) => {
                    const player = playerByTeamAndName(impact.team, impact.player_name)
                    const scoreProgress = player ? Math.round(player.score * 100) : null
                    const scoreDisplay = player ? (player.score * 10).toFixed(1) : null
                    return (
                      <div key={`${impact.player_name}-${idx}`} className="flex items-start gap-2.5">
                        <PlayerAvatar
                          name={impact.player_name}
                          imageUrl={player?.avatar_url}
                          tone={impact.team}
                          size="xs"
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`font-mono text-[10px] font-semibold ${impact.team === 'home' ? 'text-accent' : 'text-accent2'}`}>
                              {impact.player_name}
                            </span>
                            <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest px-1 py-0 h-auto border-border/50 text-muted rounded">
                              {impact.role}
                            </Badge>
                            {scoreDisplay != null && (
                              <span className="font-mono text-[9px] text-muted tabular-nums ml-auto">{scoreDisplay}</span>
                            )}
                          </div>
                          {scoreProgress != null && (
                            <Progress
                              value={scoreProgress}
                              className="h-1 mb-1 bg-surface"
                              style={{ '--color-primary': `var(--color-${impact.team === 'home' ? 'accent' : 'accent2'})` } as React.CSSProperties}
                            />
                          )}
                          <p className="font-mono text-[9px] text-muted/80">{impact.impact_note}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="columns-1 lg:columns-2 gap-3">
            {/* ── 2. Economy ─────────────────────────────────────────────── */}
            <AnalysisSection
              title="Economy"
              className="break-inside-avoid mb-3"
              titleClassName="text-muted"
              headerClassName="mb-2"
              headerRight={(
                <SectionWinner
                  values={[
                    post.economy_proxies.indicators.opening_control_pp,
                    post.economy_proxies.indicators.survival_edge_kast_pp,
                    post.economy_proxies.indicators.damage_pressure_edge_dpr,
                    post.economy_proxies.indicators.trade_structure_pp,
                    post.economy_proxies.indicators.survival_edge_pp,
                  ]}
                  homeLabel={hl}
                  awayLabel={al}
                />
              )}
            >
              <p className="font-mono text-[11px] text-text mb-3">{post.economy_proxies.summary}</p>

              {/* Primary signals */}
              <div className="space-y-2.5 rounded-lg border border-border/25 bg-surface/40 p-2.5 mb-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted/60 pb-1 border-b border-border/20">Primary Signals</p>
                <MetricBar
                  label="Opening Duel"
                  tooltip="Opening duel win% as a proxy for who sets the economy tempo early in the round."
                  value={post.economy_proxies.indicators.opening_control_pp}
                  maxAbs={15}
                  homeVal={`${homeODpct.toFixed(1)}%`}
                  awayVal={`${awayODpct.toFixed(1)}%`}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
                <MetricBar
                  label="KAST"
                  tooltip="KAST edge. Higher KAST usually means more weapons carried into the next round."
                  value={post.economy_proxies.indicators.survival_edge_kast_pp}
                  maxAbs={20}
                  homeVal={`${homeKASTpct.toFixed(1)}%`}
                  awayVal={`${awayKASTpct.toFixed(1)}%`}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
                <MetricBar
                  label="Damage Per Round"
                  tooltip="DPR edge. Damage pressure forces more saves and weaker buys next round."
                  value={post.economy_proxies.indicators.damage_pressure_edge_dpr}
                  maxAbs={20}
                  homeVal={homeDPRraw.toFixed(1)}
                  awayVal={awayDPRraw.toFixed(1)}
                  homeLogo={homeLogo}
                  awayLogo={awayLogo}
                />
              </div>

              {/* Support signals */}
              {(post.economy_proxies.indicators.trade_structure_pp != null ||
                post.economy_proxies.indicators.survival_edge_pp != null) && (
                <div className="space-y-2 rounded-lg border border-border/20 bg-surface/25 p-2.5 mb-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted/50 pb-1 border-b border-border/15">Support Signals</p>
                  {post.economy_proxies.indicators.trade_structure_pp != null && (
                    <MetricBar
                      label="Trade Kills"
                      tooltip="Trade kills per 100 rounds as an economy proxy. Strong trading preserves full-weapon rounds."
                      value={post.economy_proxies.indicators.trade_structure_pp}
                      maxAbs={12}
                      homeVal={homeTradeK100 != null ? `${homeTradeK100.toFixed(1)}/100r` : undefined}
                      awayVal={awayTradeK100 != null ? `${awayTradeK100.toFixed(1)}/100r` : undefined}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                      dim
                    />
                  )}
                  {post.economy_proxies.indicators.survival_edge_pp != null && (
                    <MetricBar
                      label="Survival"
                      tooltip="Survival rate per round. Directly tied to carrying weapons into the next round."
                      value={post.economy_proxies.indicators.survival_edge_pp}
                      maxAbs={20}
                      homeVal={homeSurvPct != null ? `${homeSurvPct.toFixed(1)}%` : undefined}
                      awayVal={awaySurvPct != null ? `${awaySurvPct.toFixed(1)}%` : undefined}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                      dim
                    />
                  )}
                </div>
              )}

            </AnalysisSection>

            {/* ── 3. Teamplay Control ────────────────────────────────────── */}
            {post.teamplay_control && (() => {
              const tradeEdge = post.teamplay_control!.indicators.trade_kill_edge_per_100_rounds
              return (
                <AnalysisSection
                  title="Teamplay Control"
                  className="break-inside-avoid mb-3"
                  titleClassName="text-muted"
                  headerClassName="mb-2"
                  headerRight={(
                    <SectionWinner
                      values={[
                        tradeEdge,
                        post.teamplay_control!.indicators.trade_recovery_edge_pp,
                        post.teamplay_control!.indicators.assist_edge_per_round,
                      ]}
                      homeLabel={hl}
                      awayLabel={al}
                    />
                  )}
                >
                  <p className="font-mono text-[11px] text-text mb-3">{post.teamplay_control!.summary}</p>

                  <div className="space-y-2.5 rounded-lg border border-border/25 bg-surface/40 p-2.5">
                    <MetricBar
                      label="Trade Kills"
                      tooltip="Trade kills per 100 rounds. A trade is a kill within 5 seconds after a teammate dies."
                      value={tradeEdge}
                      maxAbs={12}
                      homeVal={homeTradeK100 != null ? `${homeTradeK100.toFixed(1)}/100r` : undefined}
                      awayVal={awayTradeK100 != null ? `${awayTradeK100.toFixed(1)}/100r` : undefined}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                    />
                    {post.teamplay_control!.indicators.trade_recovery_edge_pp != null && (
                      <MetricBar
                        label="Death-Trade Recovery"
                        tooltip="Share of deaths that were immediately traded. High recovery means fewer rounds lost off one pick."
                        value={post.teamplay_control!.indicators.trade_recovery_edge_pp}
                        maxAbs={20}
                        homeVal={homeTradeD100 != null ? `${homeTradeD100.toFixed(1)}/100r` : undefined}
                        awayVal={awayTradeD100 != null ? `${awayTradeD100.toFixed(1)}/100r` : undefined}
                        homeLogo={homeLogo}
                        awayLogo={awayLogo}
                      />
                    )}
                    <MetricBar
                      label="Assists"
                      tooltip="Assists per round as a proxy for utility sync and coordinated fights."
                      value={post.teamplay_control!.indicators.assist_edge_per_round}
                      maxAbs={0.12}
                      homeVal={`${homeAssistPR.toFixed(2)}/r`}
                      awayVal={`${awayAssistPR.toFixed(2)}/r`}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                    />
                  </div>
                </AnalysisSection>
              )
            })()}

            {/* ── 4. Round Stability ──────────────────────────────────────── */}
            {post.round_stability && (
              <AnalysisSection
                title="Round Stability"
                className="break-inside-avoid mb-3"
                titleClassName="text-muted"
                headerClassName="mb-2"
                headerRight={(
                  <SectionWinner
                    values={[
                      post.round_stability.indicators.kast_edge_pp,
                      post.round_stability.indicators.survival_edge_pp,
                      post.round_stability.indicators.survival_minus_kast_edge_pp,
                    ]}
                    homeLabel={hl}
                    awayLabel={al}
                  />
                )}
              >
                <p className="font-mono text-[11px] text-text mb-3">{post.round_stability.summary}</p>

                {/* Radar chart when ≥2 axes */}
                {stabilityData.length >= 2 && (
                  <ChartContainer config={tacticalChartConfig} className="h-[160px] w-full mb-3">
                    <RadarChart data={stabilityData} margin={{ top: 8, right: 28, bottom: 8, left: 28 }}>
                      <PolarGrid stroke="rgba(42,48,68,0.6)" />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                      />
                      <Radar
                        name={hl}
                        dataKey="home"
                        stroke="var(--color-accent)"
                        fill="var(--color-accent)"
                        fillOpacity={0.22}
                        strokeWidth={1.5}
                      />
                      <Radar
                        name={al}
                        dataKey="away"
                        stroke="var(--color-accent2)"
                        fill="var(--color-accent2)"
                        fillOpacity={0.18}
                        strokeWidth={1.5}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </RadarChart>
                  </ChartContainer>
                )}

                <div className="space-y-2.5 rounded-lg border border-border/25 bg-surface/40 p-2.5">
                  {post.round_stability.indicators.survival_edge_pp != null && (
                    <MetricBar
                      label="Survival"
                      tooltip="Share of players who survive the round. Higher survival helps preserve weapons and maintain pressure."
                      value={post.round_stability.indicators.survival_edge_pp}
                      maxAbs={20}
                      homeVal={homeSurvPct != null ? `${homeSurvPct.toFixed(1)}%` : undefined}
                      awayVal={awaySurvPct != null ? `${awaySurvPct.toFixed(1)}%` : undefined}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                    />
                  )}
                  <MetricBar
                    label="KAST"
                    tooltip="KAST stabilizes around 150 rounds, much sooner than K/D. Strongest stability indicator here."
                    value={post.round_stability.indicators.kast_edge_pp}
                    maxAbs={20}
                    homeVal={`${homeKASTpct.toFixed(1)}%`}
                    awayVal={`${awayKASTpct.toFixed(1)}%`}
                    homeLogo={homeLogo}
                    awayLogo={awayLogo}
                  />
                  {post.round_stability.indicators.survival_minus_kast_edge_pp != null && (
                    <MetricBar
                      label="Survival − KAST Gap"
                      tooltip="Per team: survival% minus KAST%. Positive means passive survivability; negative means impact despite deaths."
                      value={post.round_stability.indicators.survival_minus_kast_edge_pp}
                      maxAbs={12}
                      homeVal={homeKASTSurvGap != null ? `${homeKASTSurvGap >= 0 ? '+' : ''}${homeKASTSurvGap.toFixed(1)}%` : undefined}
                      awayVal={awayKASTSurvGap != null ? `${awayKASTSurvGap >= 0 ? '+' : ''}${awayKASTSurvGap.toFixed(1)}%` : undefined}
                      homeLogo={homeLogo}
                      awayLogo={awayLogo}
                    />
                  )}
                </div>
              </AnalysisSection>
            )}

            {/* ── 5. Late-round impact ────────────────────────────────────── */}
            {post.late_round_conversion && (
              <AnalysisSection
                title="Late-round Impact"
                className="break-inside-avoid mb-3"
                titleClassName="text-muted"
                headerClassName="mb-2"
                headerRight={lateRoundHasData ? (
                  <SectionWinner
                    values={[
                      lateRoundMetrics?.clutch_wins_per_map?.edge,
                      lateRoundMetrics?.one_v_x_wins_per_map?.edge,
                      lateRoundMetrics?.explosive_rounds_per_map?.edge,
                    ]}
                    homeLabel={hl}
                    awayLabel={al}
                  />
                ) : undefined}
              >
                <p className="font-mono text-[11px] text-text mb-3">{post.late_round_conversion.summary}</p>

                {lateRoundHasData ? (
                  <div className="space-y-2.5 rounded-lg border border-border/25 bg-surface/40 p-2.5">
                    {lateRoundMetrics?.clutch_wins_per_map && (
                      <MetricBar
                        label="Clutch Wins"
                        tooltip="Won 1vX situations per map. Very high variance in short series, so treat as a signal rather than a verdict."
                        value={lateRoundMetrics.clutch_wins_per_map.edge}
                        maxAbs={1.5}
                        suffix="/map edge"
                        homeVal={lateRoundMetrics.clutch_wins_per_map.home > 0 ? `${lateRoundMetrics.clutch_wins_per_map.home.toFixed(2)}/map` : undefined}
                        awayVal={lateRoundMetrics.clutch_wins_per_map.away > 0 ? `${lateRoundMetrics.clutch_wins_per_map.away.toFixed(2)}/map` : undefined}
                        homeLogo={homeLogo}
                        awayLogo={awayLogo}
                        homeLabel={hl}
                        awayLabel={al}
                      />
                    )}
                    {lateRoundMetrics?.one_v_x_wins_per_map && (
                      <MetricBar
                        label="1vX Wins"
                        tooltip="Won 1vX clutches per map. This is clutch outcome, not attempt volume."
                        value={lateRoundMetrics.one_v_x_wins_per_map.edge}
                        maxAbs={2}
                        suffix="/map edge"
                        homeVal={lateRoundMetrics.one_v_x_wins_per_map.home > 0 ? `${lateRoundMetrics.one_v_x_wins_per_map.home.toFixed(2)}/map` : undefined}
                        awayVal={lateRoundMetrics.one_v_x_wins_per_map.away > 0 ? `${lateRoundMetrics.one_v_x_wins_per_map.away.toFixed(2)}/map` : undefined}
                        homeLogo={homeLogo}
                        awayLogo={awayLogo}
                        homeLabel={hl}
                        awayLabel={al}
                      />
                    )}
                    {lateRoundMetrics?.explosive_rounds_per_map && (
                      <MetricBar
                        label="Explosive Rounds"
                        tooltip="Rounds with 3+ fast kills per map. A proxy for aggression tempo and round-closing power."
                        value={lateRoundMetrics.explosive_rounds_per_map.edge}
                        maxAbs={2}
                        suffix="/map edge"
                        homeVal={lateRoundMetrics.explosive_rounds_per_map.home > 0 ? `${lateRoundMetrics.explosive_rounds_per_map.home.toFixed(2)}/map` : undefined}
                        awayVal={lateRoundMetrics.explosive_rounds_per_map.away > 0 ? `${lateRoundMetrics.explosive_rounds_per_map.away.toFixed(2)}/map` : undefined}
                        homeLogo={homeLogo}
                        awayLogo={awayLogo}
                        homeLabel={hl}
                        awayLabel={al}
                      />
                    )}
                    <p className="font-mono text-[9px] text-muted/50 border-t border-border/20 pt-1.5">
                      Values by the team logos show the level for each team. The center bar shows the edge between them.
                    </p>
                  </div>
                ) : (
                  <DataQualityNotice message="BL API is missing clutch and explosive-round telemetry for this match." />
                )}
              </AnalysisSection>
            )}

            {/* ── 6. Player Development ──────────────────────────────────── */}
            <AnalysisSection
              title="Player Development"
              className="break-inside-avoid mb-3"
              titleClassName="text-muted"
              headerClassName="mb-2"
              headerRight={isRelativeDev ? (
                <Badge variant="outline" className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 h-auto rounded border-warning/40 text-warning/80 bg-warning/5">
                  In-match
                </Badge>
              ) : undefined}
            >
              {isRatingDev && !isRelativeDev && (
                <p className="font-mono text-[9px] text-muted/60 mb-2.5">Shows BL R-rating against the historical BL baseline. No artificial 0-100 scale is used here.</p>
              )}
              {isRelativeDev && (
                <p className="font-mono text-[9px] text-muted/60 mb-2.5">No historical baseline available, so this shows relative in-match performance.</p>
              )}
              {post.player_development.focus_players.length > 0 ? (
                <div className="space-y-2">
                  {post.player_development.focus_players.map((focus, idx) => {
                    const player = playerByTeamAndName(focus.team, focus.player_name)
                    const scoreVal = focus.score != null ? focus.score : player?.score
                    const scoreMax = focus.score_max ?? 1
                    const scorePct = scoreVal != null ? Math.round((scoreVal / scoreMax) * 100) : null
                    const scoreDisplay = scoreVal != null ? (scoreVal * 10).toFixed(1) : null
                    const showsValueComparison =
                      focus.current_value != null &&
                      focus.baseline_value != null &&
                      focus.delta_value != null
                    const currentValue = focus.current_value ?? 0
                    const baselineValue = focus.baseline_value ?? 0
                    const deltaValue = focus.delta_value ?? 0
                    return (
                      <div key={`${focus.player_name}-${idx}`} className="rounded-lg border border-border/25 px-2.5 py-2.5 bg-surface/30">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <Badge
                            variant="outline"
                            className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 h-auto rounded ${
                              focus.team === 'home'
                                ? 'border-accent/40 text-accent bg-accent/10'
                                : 'border-accent2/40 text-accent2 bg-accent2/10'
                            }`}
                          >
                            {teamLabel(result, focus.team)}
                          </Badge>
                          <span className="inline-flex items-center gap-1.5">
                            <PlayerAvatar
                              name={focus.player_name}
                              imageUrl={player?.avatar_url}
                              tone={focus.team}
                              size="xs"
                            />
                            <span className="font-mono text-[11px] text-text font-semibold">{focus.player_name}</span>
                          </span>
                          <Badge
                            variant="outline"
                            className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 h-auto rounded ml-auto ${trendBadgeClass(focus.trend)}`}
                          >
                            {focus.trend === 'overperforming'
                              ? '▲ Over'
                              : focus.trend === 'underperforming'
                                ? '▼ Under'
                                : '— Stable'}
                          </Badge>
                        </div>

                        {showsValueComparison && (
                          <div className="mb-2 grid grid-cols-3 gap-2">
                            <div className="rounded border border-border/20 bg-surface/40 px-2 py-1.5">
                              <p className="font-mono text-[8px] uppercase tracking-widest text-muted/70 mb-0.5">
                                {focus.metric === 'bl_rating' ? 'R-rating' : 'Score /10'}
                              </p>
                              <p className="font-mono text-[11px] tabular-nums text-text">
                                {currentValue.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded border border-border/20 bg-surface/40 px-2 py-1.5">
                              <p className="font-mono text-[8px] uppercase tracking-widest text-muted/70 mb-0.5">
                                {focus.metric === 'bl_rating' ? 'Baseline' : 'Match Avg /10'}
                              </p>
                              <p className="font-mono text-[11px] tabular-nums text-text">
                                {baselineValue.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded border border-border/20 bg-surface/40 px-2 py-1.5">
                              <p className="font-mono text-[8px] uppercase tracking-widest text-muted/70 mb-0.5">
                                {focus.metric === 'bl_rating' ? 'Delta' : 'Delta /10'}
                              </p>
                              <p className={`font-mono text-[11px] tabular-nums ${
                                deltaValue > 0
                                  ? 'text-success'
                                  : deltaValue < 0
                                    ? 'text-danger'
                                    : 'text-muted'
                              }`}>
                                {formatSigned(deltaValue)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Score bar fallback */}
                        {!showsValueComparison && scorePct != null && (
                          <div className="mb-2">
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className="font-mono text-[9px] text-muted/70">Score /10</span>
                              <span className="font-mono text-[10px] tabular-nums text-muted">{scoreDisplay}</span>
                            </div>
                            <Progress
                              value={scorePct}
                              className="h-1.5 bg-surface"
                              style={{ '--color-primary': `var(--color-${focus.team === 'home' ? 'accent' : 'accent2'})` } as React.CSSProperties}
                            />
                          </div>
                        )}

                        <p className="font-mono text-[10px] text-muted">{focus.note}</p>
                        <p className="font-mono text-[10px] text-muted/70 mt-1">
                          <span className="text-muted/50">Action: </span>{focus.action}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="font-mono text-[11px] text-muted">No player focus available.</p>
              )}
            </AnalysisSection>

            {/* ── 7. Coach Notes ─────────────────────────────────────────── */}
            <AnalysisSection
              title="Coach Notes"
              className="break-inside-avoid mb-3"
              titleClassName="text-muted"
              headerClassName="mb-2"
            >
              {post.coach_recommendations.length > 0 ? (
                <ol className="space-y-1.5">
                  {post.coach_recommendations.map((recommendation, idx) => (
                    <li key={`coach-${idx}`} className="flex items-start gap-2">
                      <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full border border-border/45 text-[9px] font-mono text-muted flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <p className="font-mono text-[10px] text-text/90">{recommendation}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-mono text-[11px] text-muted">No recommendations available.</p>
              )}
            </AnalysisSection>
            </div>

          </div>
        )
      })()}
    </section>
  )
}

function LineupPicker({
  homeTeamName,
  awayTeamName,
  homeTeamLogoUrl,
  awayTeamLogoUrl,
  homePool,
  awayPool,
  selectedHomeIds,
  selectedAwayIds,
  lineupSize,
  onToggleHome,
  onToggleAway,
}: {
  homeTeamName: string
  awayTeamName: string
  homeTeamLogoUrl?: string
  awayTeamLogoUrl?: string
  homePool: PlayerAnalysis[]
  awayPool: PlayerAnalysis[]
  selectedHomeIds: Set<number>
  selectedAwayIds: Set<number>
  lineupSize: number
  onToggleHome: (id: number) => void
  onToggleAway: (id: number) => void
}) {
  const selectedHomeCount = selectedHomeIds.size
  const selectedAwayCount = selectedAwayIds.size

  return (
    <div className="bg-surface border border-border/50 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-display text-[10px] uppercase tracking-widest text-accent">
          5v5 lineup-simulator
        </h3>
        <span className="font-mono text-[10px] text-muted">
          Velg {lineupSize} per lag
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded border border-border/35 p-3">
          <p className="font-mono text-xs text-accent mb-2 inline-flex items-center gap-1.5">
            <TeamLogo name={homeTeamName} logoUrl={homeTeamLogoUrl} tone="home" size="sm" />
            {homeTeamName}
          </p>
          <p className="font-mono text-[10px] text-muted mb-2">Valgt: {selectedHomeCount}/{lineupSize}</p>
          <div className="space-y-1.5">
            {homePool.map((player) => {
              const selected = selectedHomeIds.has(player.paradise_user_id)
              const disabled = !selected && selectedHomeIds.size >= lineupSize
              return (
                <button
                  key={player.paradise_user_id}
                  type="button"
                  onClick={() => onToggleHome(player.paradise_user_id)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-left ${selected ? 'border-accent/60 bg-accent/10' : 'border-border/35 bg-surface2/25'} disabled:opacity-45`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <PlayerAvatar name={player.name} imageUrl={player.avatar_url} tone="home" size="xs" />
                    <span className="font-mono text-[11px] text-text truncate">{player.name}</span>
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">{(player.score * 10).toFixed(1)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded border border-border/35 p-3">
          <p className="font-mono text-xs text-accent2 mb-2 inline-flex items-center gap-1.5">
            <TeamLogo name={awayTeamName} logoUrl={awayTeamLogoUrl} tone="away" size="sm" />
            {awayTeamName}
          </p>
          <p className="font-mono text-[10px] text-muted mb-2">Valgt: {selectedAwayCount}/{lineupSize}</p>
          <div className="space-y-1.5">
            {awayPool.map((player) => {
              const selected = selectedAwayIds.has(player.paradise_user_id)
              const disabled = !selected && selectedAwayIds.size >= lineupSize
              return (
                <button
                  key={player.paradise_user_id}
                  type="button"
                  onClick={() => onToggleAway(player.paradise_user_id)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-left ${selected ? 'border-accent2/60 bg-accent2/10' : 'border-border/35 bg-surface2/25'} disabled:opacity-45`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <PlayerAvatar name={player.name} imageUrl={player.avatar_url} tone="away" size="xs" />
                    <span className="font-mono text-[11px] text-text truncate">{player.name}</span>
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">{(player.score * 10).toFixed(1)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function AnalysisDisplay({
  result,
  showCopyReport = false,
}: {
  result: AnalyzeResponse
  showCopyReport?: boolean
}) {
  const homeName = result.teams.home.name || 'Home'
  const awayName = result.teams.away.name || 'Away'
  const isUpcoming = result.meta.match_status === 'upcoming'

  const lineupSize = result.simulation?.lineup_size ?? 5
  const homePool = result.teams.home.players
  const awayPool = result.teams.away.players

  const getDefaultIds = (players: PlayerAnalysis[]) =>
    new Set(
      [...players]
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(lineupSize, players.length))
        .map((p) => p.paradise_user_id),
    )

  const [selectedHomeIds, setSelectedHomeIds] = useState<Set<number>>(() => getDefaultIds(homePool))
  const [selectedAwayIds, setSelectedAwayIds] = useState<Set<number>>(() => getDefaultIds(awayPool))

  useEffect(() => {
    setSelectedHomeIds(getDefaultIds(homePool))
    setSelectedAwayIds(getDefaultIds(awayPool))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.matchup_id, result.meta.fetched_at, lineupSize])

  const toggleSelection = (
    setter: Dispatch<SetStateAction<Set<number>>>,
    id: number,
  ) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= lineupSize) return prev
      next.add(id)
      return next
    })
  }

  const selectedHomePlayers = useMemo(
    () => homePool.filter((p) => selectedHomeIds.has(p.paradise_user_id)),
    [homePool, selectedHomeIds],
  )
  const selectedAwayPlayers = useMemo(
    () => awayPool.filter((p) => selectedAwayIds.has(p.paradise_user_id)),
    [awayPool, selectedAwayIds],
  )

  const hasExactLineups =
    selectedHomePlayers.length === Math.min(lineupSize, homePool.length) &&
    selectedAwayPlayers.length === Math.min(lineupSize, awayPool.length)
  const usingLiveLineup = isUpcoming && hasExactLineups

  const displayTeams = useMemo(() => {
    if (!isUpcoming || !hasExactLineups) return result.teams
    return {
      home: {
        ...result.teams.home,
        players: selectedHomePlayers,
      },
      away: {
        ...result.teams.away,
        players: selectedAwayPlayers,
      },
    }
  }, [hasExactLineups, isUpcoming, result.teams, selectedAwayPlayers, selectedHomePlayers])

  const defaultTeams = useMemo(() => {
    if (!isUpcoming) return result.teams
    return {
      home: {
        ...result.teams.home,
        players: homePool.filter((player) => getDefaultIds(homePool).has(player.paradise_user_id)),
      },
      away: {
        ...result.teams.away,
        players: awayPool.filter((player) => getDefaultIds(awayPool).has(player.paradise_user_id)),
      },
    }
  }, [awayPool, homePool, isUpcoming, result.teams])

  const liveMapPool = useMemo<LandingMapPool | undefined>(() => {
    if (!isUpcoming) return undefined
    return result.landing?.map_pool
  }, [isUpcoming, result.landing?.map_pool])

  const displayLanding = useMemo(() => {
    if (!isUpcoming) return result.landing
    return deriveLandingAnalytics(displayTeams, { mapPool: liveMapPool })
  }, [displayTeams, isUpcoming, liveMapPool, result.landing])

  const defaultLanding = useMemo(() => {
    if (!isUpcoming) return result.landing
    return deriveLandingAnalytics(defaultTeams, { mapPool: liveMapPool })
  }, [defaultTeams, isUpcoming, liveMapPool, result.landing])

  return (
    <div>
      {showCopyReport && (
        <div className="mb-4 flex justify-end">
          <CopyReportButton result={result} />
        </div>
      )}

      <MetaBar meta={result.meta} />

      {isUpcoming ? (
        <>
          {displayLanding && defaultLanding && (
            <UpcomingMatchModules
              home={displayTeams.home}
              away={displayTeams.away}
              defaultHome={defaultTeams.home}
              defaultAway={defaultTeams.away}
              landing={displayLanding}
              defaultLanding={defaultLanding}
              usingLiveLineup={usingLiveLineup}
            />
          )}

          <details className="mb-6 rounded-xl border border-border/45 bg-surface px-4 py-3">
            <summary className="cursor-pointer select-none font-display text-[10px] uppercase tracking-[0.2em] text-accent">
              Lineup simulator
            </summary>
            <div className="mt-4">
              <LineupPicker
                homeTeamName={homeName}
                awayTeamName={awayName}
                homeTeamLogoUrl={result.teams.home.logo_url}
                awayTeamLogoUrl={result.teams.away.logo_url}
                homePool={homePool}
                awayPool={awayPool}
                selectedHomeIds={selectedHomeIds}
                selectedAwayIds={selectedAwayIds}
                lineupSize={lineupSize}
                onToggleHome={(id) => toggleSelection(setSelectedHomeIds, id)}
                onToggleAway={(id) => toggleSelection(setSelectedAwayIds, id)}
              />

              {!hasExactLineups && (
                <div className="mt-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 font-mono text-[11px] text-warning">
                  Select exactly {lineupSize} players on both teams for live 5v5 simulation.
                </div>
              )}
            </div>
          </details>

          <MapPoolDebugPanel
            className="mt-3"
            matchupId={result.matchup_id}
            mapPool={liveMapPool}
          />
        </>
      ) : (
        <PostMatchReport result={result} />
      )}

      {isUpcoming && (
        <EarlyRoundAndFormPanel
          home={displayTeams.home}
          away={displayTeams.away}
          landing={result.landing}
          usingLiveLineup={usingLiveLineup}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TeamCard team={displayTeams.home} accent="accent" matchStatus={result.meta.match_status} />
        <TeamCard team={displayTeams.away} accent="accent2" matchStatus={result.meta.match_status} />
      </div>
    </div>
  )
}
