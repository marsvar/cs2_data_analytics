'use client'

import { useMemo } from 'react'
import { AnalysisSection } from '@/components/analysis-section'
import { HeadToHeadBar } from '@/components/head-to-head-bar'
import { PlayerAvatar, TeamLogo } from '@/components/identity-badge'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { normalizeActiveDutyMap } from '@/lib/map-pool'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from 'recharts'

type Landing = NonNullable<AnalyzeResponse['landing']>
type MatchupAxis = NonNullable<Landing['matchup_axes']>[number]
type WatchItem = NonNullable<Landing['watchlist']>['home']['initiators'][number]
type WatchCategory = 'initiators' | 'form_players' | 'risk_players'

const PRE_MATCH_CONTROL_TOOLTIP = 'These axes are selected because they are the most stable pre-match signals available before the first pistol round: opening duels set early tempo, trade structure and survival discipline indicate how robust a team is over multiple rounds, entry pressure captures initiative, and map leverage ties the roster to the veto picture. Together they provide a more reliable match read than individual highlight stats.'

function formatMapName(map: string): string {
  const normalized = map.replace(/^de_/, '')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function signed(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function signedPercentPoints(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`
}

function shareBand(homeValue: number, awayValue: number): { home: number; away: number } {
  const safeHome = Math.max(homeValue, 0)
  const safeAway = Math.max(awayValue, 0)
  const total = safeHome + safeAway
  if (total <= 0) return { home: 50, away: 50 }
  const home = (safeHome / total) * 100
  return { home, away: 100 - home }
}

function mapPressureRead(params: {
  homeWinRate?: number
  awayWinRate?: number
  homeSampleSize: number
  awaySampleSize: number
  homeName: string
  awayName: string
}): {
  headline: string
  detail: string
  tone: 'home' | 'away' | 'even' | 'muted'
} {
  const { homeWinRate, awayWinRate, homeSampleSize, awaySampleSize, homeName, awayName } = params

  if (homeWinRate == null && awayWinRate == null) {
    return {
      headline: 'No read',
      detail: 'Neither team has usable map data yet.',
      tone: 'muted',
    }
  }

  if (homeWinRate != null && awayWinRate == null) {
    return {
      headline: `${homeName} one-sided read`,
      detail: `${homeName} has data on ${homeSampleSize} map${homeSampleSize === 1 ? '' : 's'}, but ${awayName} has no comparison baseline.`,
      tone: 'home',
    }
  }

  if (homeWinRate == null && awayWinRate != null) {
    return {
      headline: `${awayName} one-sided read`,
      detail: `${awayName} has data on ${awaySampleSize} map${awaySampleSize === 1 ? '' : 's'}, but ${homeName} has no comparison baseline.`,
      tone: 'away',
    }
  }

  const edge = (homeWinRate ?? 0.5) - (awayWinRate ?? 0.5)
  const delta = Math.abs(edge) * 100

  if (delta < 3.5) {
    return {
      headline: 'Even pressure map',
      detail: `Both teams are close here. This map looks more like a coinflip than a clear pick.`,
      tone: 'even',
    }
  }

  const leader = edge > 0 ? homeName : awayName
  return {
    headline: `${leader} +${delta.toFixed(0)} pp`,
    detail: `Read builds on ${homeSampleSize + awaySampleSize} recorded maps total — weight against the confidence level.`,
    tone: edge > 0 ? 'home' : 'away',
  }
}

function comparePlayerSets(a: PlayerAnalysis[], b: PlayerAnalysis[]): boolean {
  if (a.length !== b.length) return false
  const aIds = new Set(a.map((player) => player.paradise_user_id))
  return b.every((player) => aIds.has(player.paradise_user_id))
}

function mapEdgeFromPlayers(homePlayers: PlayerAnalysis[], awayPlayers: PlayerAnalysis[]): number {
  const aggregate = (players: PlayerAnalysis[]) => {
    let wins = 0
    let total = 0
    for (const player of players) {
      for (const match of player.recent_matches ?? []) {
        const map = normalizeActiveDutyMap(match.map_name)
        if (!map) continue
        total += 1
        if (match.outcome === 'win') wins += 1
      }
    }
    return total > 0 ? wins / total : 0.5
  }

  return aggregate(homePlayers) - aggregate(awayPlayers)
}

function confidenceChip(confidence: MatchupAxis['confidence']) {
  if (confidence === 'high') {
    return { label: 'Strong', className: 'border-success/35 bg-success/10 text-success' }
  }
  if (confidence === 'medium') {
    return { label: 'Moderate', className: 'border-warning/35 bg-warning/10 text-warning' }
  }
  return { label: 'Thin', className: 'border-border/45 bg-surface2/50 text-muted' }
}

function mapConfidenceDot(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return 'text-success'
  if (confidence === 'medium') return 'text-warning'
  return 'text-muted/40'
}

function metricChips(category: WatchCategory, player: PlayerAnalysis | undefined, item: WatchItem): string[] {
  if (!player) return [item.display_value]

  if (category === 'initiators') {
    const chips = [
      `OD ${Math.round(player.od_rate * 100)}%`,
      `Score ${(player.score * 10).toFixed(1)}`,
    ]
    if (player.bl_extended?.firstkills != null && player.rounds > 0) {
      chips.splice(1, 0, `FK/R ${(player.bl_extended.firstkills / player.rounds).toFixed(2)}`)
    }
    return chips
  }

  if (category === 'form_players') {
    const chips = [
      `Now ${(player.score * 10).toFixed(1)}`,
      item.display_value,
    ]
    if (player.leetify_prior != null) {
      chips.splice(1, 0, `Baseline ${(player.leetify_prior * 10).toFixed(1)}`)
    }
    return chips
  }

  return [
    `CI ${player.ci.toFixed(2)}`,
    `${player.rounds} rounds`,
    `Score ${(player.score * 10).toFixed(1)}`,
  ]
}

function PlayerStoryGroup({
  title,
  category,
  items,
  players,
  tone,
}: {
  title: string
  category: WatchCategory
  items: WatchItem[]
  players: PlayerAnalysis[]
  tone: 'home' | 'away'
}) {
  return (
    <div className="rounded-lg border border-border/25 bg-surface/55 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted/55">{title}</p>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="font-mono text-[11px] text-muted">No clear signals.</p>
        ) : (
          items.map((item) => {
            const player = players.find((entry) => entry.paradise_user_id === item.paradise_user_id)
            const chips = metricChips(category, player, item)

            return (
              <div key={`${title}-${item.paradise_user_id}`} className="space-y-2 rounded border border-border/25 bg-surface/35 p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <PlayerAvatar name={item.name} imageUrl={item.avatar_url} tone={tone} size="xs" />
                      <span className="font-mono text-[11px] text-text truncate">{item.name}</span>
                    </span>
                    <p className="mt-1 font-mono text-[10px] text-muted">{item.reason}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted/70">{item.display_value}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <span
                      key={`${item.paradise_user_id}-${chip}`}
                      className="rounded border border-border/30 bg-surface2/60 px-1.5 py-1 font-mono text-[9px] uppercase tracking-widest text-muted/80"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TeamStoryCard({
  name,
  logoUrl,
  tone,
  players,
  watch,
}: {
  name: string
  logoUrl?: string
  tone: 'home' | 'away'
  players: PlayerAnalysis[]
  watch: NonNullable<Landing['watchlist']>['home']
}) {
  const toneClasses = tone === 'home'
    ? {
      border: 'border-accent/20',
      badge: 'border-accent/25 bg-accent/10 text-accent',
    }
    : {
      border: 'border-accent2/20',
      badge: 'border-accent2/25 bg-accent2/10 text-accent2',
    }

  return (
    <div className={`rounded-xl border bg-surface/92 ${toneClasses.border}`}>
      <div className="p-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${toneClasses.badge}`}>
              <TeamLogo name={name} logoUrl={logoUrl} tone={tone} size="sm" />
              <span className="truncate">{name}</span>
            </div>
            <p className="mt-2 font-display text-sm leading-none text-text">Players to Watch</p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted/55">
            3 reads
          </span>
        </div>
      </div>
      <div className="space-y-2.5 p-3 pt-0">
        <PlayerStoryGroup title="Initiators" category="initiators" items={watch.initiators.slice(0, 1)} players={players} tone={tone} />
        <PlayerStoryGroup title="Form" category="form_players" items={watch.form_players.slice(0, 1)} players={players} tone={tone} />
        <PlayerStoryGroup title="Volatility risk" category="risk_players" items={watch.risk_players.slice(0, 1)} players={players} tone={tone} />
      </div>
    </div>
  )
}

export function UpcomingMatchModules({
  home,
  away,
  defaultHome,
  defaultAway,
  landing,
  defaultLanding,
  usingLiveLineup,
}: {
  home: Team
  away: Team
  defaultHome: Team
  defaultAway: Team
  landing: Landing
  defaultLanding: Landing
  usingLiveLineup: boolean
}) {
  const axes = landing.matchup_axes ?? []
  const homeName = home.name || 'Home'
  const awayName = away.name || 'Away'

  const lineupDelta = useMemo(() => {
    const changed =
      !comparePlayerSets(home.players, defaultHome.players) ||
      !comparePlayerSets(away.players, defaultAway.players)

    const currentMapEdge = mapEdgeFromPlayers(home.players, away.players)
    const defaultMapEdge = mapEdgeFromPlayers(defaultHome.players, defaultAway.players)

    return {
      changed,
      home_win_pct_delta: landing.tactical_edge.home_win_pct - defaultLanding.tactical_edge.home_win_pct,
      away_win_pct_delta: landing.tactical_edge.away_win_pct - defaultLanding.tactical_edge.away_win_pct,
      opening_edge_delta: landing.early_round_edge.delta - defaultLanding.early_round_edge.delta,
      map_leverage_delta: currentMapEdge - defaultMapEdge,
    }
  }, [away.players, defaultAway.players, defaultHome.players, defaultLanding, home.players, landing])

  const radarData = axes.map((axis) => ({
    metric: axis.label,
    home: axis.home_value,
    away: axis.away_value,
    homeDisplay: axis.home_display,
    awayDisplay: axis.away_display,
    note: axis.note,
  }))

  const confidence = confidenceChip(
    axes.slice().sort((a, b) => {
      const score = (value: typeof a.confidence) => value === 'high' ? 3 : value === 'medium' ? 2 : 1
      return score(b.confidence) - score(a.confidence)
    })[0]?.confidence ?? 'low',
  )

  const sortedMaps = useMemo(() => {
    const maps = landing.map_battlefield?.maps ?? []
    const confidenceScore = (value: 'low' | 'medium' | 'high') => value === 'high' ? 3 : value === 'medium' ? 2 : 1

    return maps.slice().sort((a, b) => {
      const aSamples = a.home_sample_size + a.away_sample_size
      const bSamples = b.home_sample_size + b.away_sample_size
      const aEdge = Math.abs((a.home_win_rate ?? 0.5) - (a.away_win_rate ?? 0.5))
      const bEdge = Math.abs((b.home_win_rate ?? 0.5) - (b.away_win_rate ?? 0.5))

      return (
        confidenceScore(b.confidence) - confidenceScore(a.confidence) ||
        bSamples - aSamples ||
        bEdge - aEdge
      )
    })
  }, [landing.map_battlefield?.maps])

  return (
    <div className="space-y-4">
      <AnalysisSection
        title="Matchup Story"
        description="Combines projected win band, signal strength, and the key pre-match drivers."
        className="border-border/45 bg-surface p-3.5 md:p-4"
        headerRight={(
          <div className="flex flex-wrap items-center gap-2">
            {usingLiveLineup && (
              <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-accent">
                Live lineup
              </span>
            )}
            <span className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-widest ${confidence.className}`}>
              {confidence.label} signal
            </span>
          </div>
        )}
      >
        <div className="max-w-2xl">
          <p className="font-display text-lg leading-tight">
            {landing.tactical_edge.favored === 'even'
              ? `${homeName} and ${awayName} enter this match with small margins.`
              : `${landing.tactical_edge.favored === 'home' ? homeName : awayName} holds the pre-match edge before veto and starting side.`}
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted">{landing.tactical_edge.confidence_note}</p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-accent/20 bg-accent/6 p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-accent/80">{homeName}</p>
            <p className="mt-1 font-display text-lg leading-none text-text tabular-nums">
              {landing.tactical_edge.home_win_pct}%
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted/70">modelled win chance</p>
          </div>
          <div className="rounded-lg border border-border/30 bg-surface2/20 p-2.5 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted/55">Edge read</p>
            <p className="mt-1 font-display text-sm leading-none text-text">
              {landing.tactical_edge.favored === 'even'
                ? 'Close matchup'
                : `${Math.abs(landing.tactical_edge.home_win_pct - landing.tactical_edge.away_win_pct)} pp edge`}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted/70">
              {landing.tactical_edge.favored === 'even'
                ? 'Both teams are close before veto.'
                : `${landing.tactical_edge.favored === 'home' ? homeName : awayName} starts ahead.`}
            </p>
          </div>
          <div className="rounded-lg border border-accent2/20 bg-accent2/6 p-2.5 text-right">
            <p className="font-mono text-[9px] uppercase tracking-widest text-accent2/80">{awayName}</p>
            <p className="mt-1 font-display text-lg leading-none text-text tabular-nums">
              {landing.tactical_edge.away_win_pct}%
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted/70">modelled win chance</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="rounded-lg border border-border/30 bg-surface2/20 p-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-muted/55">Why</p>
            <ol className="space-y-1.5">
              {(landing.game_plan ?? []).map((line, index) => (
                <li key={`plan-${index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/45 font-mono text-[9px] text-muted">
                    {index + 1}
                  </span>
                  <span className="font-mono text-[11px] text-text/90">{line}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-border/30 bg-surface2/20 p-2.5">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-muted/55">Lineup impact</p>
            {lineupDelta.changed ? (
              <div className="space-y-1.5">
                <div>
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted/65">
                    <span>Win%</span>
                    <span className={lineupDelta.home_win_pct_delta >= 0 ? 'text-accent' : 'text-accent2'}>
                      {signed(lineupDelta.home_win_pct_delta, 0)} pp
                    </span>
                  </div>
                  <HeadToHeadBar
                    homeShare={Math.max(50 + lineupDelta.home_win_pct_delta * 2.5, 0)}
                    awayShare={Math.max(50 - lineupDelta.home_win_pct_delta * 2.5, 0)}
                    heightClassName="h-2"
                    showFooter={false}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div className="rounded border border-border/30 bg-surface/45 px-2 py-1.5">
                    <p className="text-muted/60">Opening edge</p>
                    <p className="mt-1 text-text">{signedPercentPoints(lineupDelta.opening_edge_delta)}</p>
                  </div>
                  <div className="rounded border border-border/30 bg-surface/45 px-2 py-1.5">
                    <p className="text-muted/60">Map leverage</p>
                    <p className="mt-1 text-text">{signedPercentPoints(lineupDelta.map_leverage_delta)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[11px] text-muted">
                Default five still in use. Swap players below to see how the projection shifts.
              </p>
            )}
          </div>
        </div>
      </AnalysisSection>

      <AnalysisSection
        title="Pre-match Control"
        description="Normalised axes show the control split in the matchup. Some axes are blended control signals; side labels and notes show the raw numbers behind them."
        className="border-border/45 bg-surface p-3.5 md:p-4"
        headerRight={(
          <div className="flex flex-wrap items-center gap-2">
            <TooltipProvider delayDuration={180}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Why these parameters are used in pre-match control"
                    className="inline-flex items-center gap-1 rounded border border-border/35 bg-surface2/40 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accent/35 hover:text-text"
                  >
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] leading-none">
                      ?
                    </span>
                    Why these?
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] border-border bg-surface2 font-mono text-[10px] leading-relaxed text-text">
                  {PRE_MATCH_CONTROL_TOOLTIP}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="inline-flex items-center gap-2 rounded border border-accent/25 bg-accent/8 px-2 py-1 font-mono text-[10px] text-accent">
              <TeamLogo name={homeName} logoUrl={home.logo_url} tone="home" size="sm" />
              {homeName}
            </div>
            <div className="inline-flex items-center gap-2 rounded border border-accent2/25 bg-accent2/8 px-2 py-1 font-mono text-[10px] text-accent2">
              <TeamLogo name={awayName} logoUrl={away.logo_url} tone="away" size="sm" />
              {awayName}
            </div>
          </div>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
          <ChartContainer
            config={{
              home: { label: homeName, color: 'var(--color-accent)' },
              away: { label: awayName, color: 'var(--color-accent2)' },
            }}
            className="h-[232px] w-full"
          >
            <RadarChart data={radarData} margin={{ top: 10, right: 28, bottom: 10, left: 28 }}>
              <PolarGrid stroke="rgba(42,48,68,0.6)" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name={homeName} dataKey="home" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.2} strokeWidth={1.5} />
              <Radar name={awayName} dataKey="away" stroke="var(--color-accent2)" fill="var(--color-accent2)" fillOpacity={0.16} strokeWidth={1.5} />
              <ChartTooltip
                content={({ label }) => {
                  const row = radarData.find((axis) => axis.metric === label)
                  if (!row) return null
                  return (
                    <div className="rounded border border-border/50 bg-surface2 px-2.5 py-1.5 font-mono text-[10px] shadow-lg">
                      <p className="mb-1 text-muted">{label}</p>
                      <p className="text-accent">{homeName}: {row.homeDisplay}</p>
                      <p className="text-accent2">{awayName}: {row.awayDisplay}</p>
                      {row.note && <p className="mt-1 text-muted/75">{row.note}</p>}
                    </div>
                  )
                }}
              />
            </RadarChart>
          </ChartContainer>

          <div className="space-y-2.5">
            {axes.map((axis) => {
              const chip = confidenceChip(axis.confidence)
              const homeLead = axis.home_value >= axis.away_value
              const band = shareBand(axis.home_value, axis.away_value)
              return (
                <div key={axis.key} className="rounded-lg border border-border/30 bg-surface2/20 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted/70">{axis.label}</p>
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest ${chip.className}`}>
                      {chip.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2">
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      <TeamLogo name={homeName} logoUrl={home.logo_url} tone="home" size="sm" />
                      <span className={`truncate font-mono text-[10px] ${homeLead ? 'text-text' : 'text-muted/65'}`}>{axis.home_display}</span>
                    </div>
                    <span className="text-center font-mono text-[9px] text-muted/55">{axis.source}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`truncate font-mono text-[10px] ${!homeLead ? 'text-text' : 'text-muted/65'}`}>{axis.away_display}</span>
                      <TeamLogo name={awayName} logoUrl={away.logo_url} tone="away" size="sm" />
                    </div>
                  </div>
                  <HeadToHeadBar
                    homeShare={band.home}
                    awayShare={band.away}
                    heightClassName="h-2"
                    showFooter={false}
                    className={homeLead ? 'opacity-100' : 'opacity-90'}
                  />
                  {axis.note && <p className="mt-1.5 font-mono text-[10px] text-muted">{axis.note}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </AnalysisSection>

      <AnalysisSection
        title="Veto & Pressure Map"
        description="Shows which maps favor each team or result in an even veto."
        className="border-border/45 bg-surface p-3.5 md:p-4"
      >
        {landing.map_battlefield && landing.map_battlefield.maps.length > 0 ? (
          <>
            {/* Column headers */}
            <div className="mb-1.5 grid grid-cols-[140px_1fr_80px_1fr] gap-x-3 px-3 font-mono text-[9px] uppercase tracking-widest text-muted/50">
              <span>Map</span>
              <span className="text-accent/70">{homeName}</span>
              <span className="text-center">Edge</span>
              <span className="text-right text-accent2/70">{awayName}</span>
            </div>

            <div className="divide-y divide-border/20 rounded-lg border border-border/30 bg-surface2/10">
              {sortedMaps.map((map) => {
                const edge = (map.home_win_rate ?? 0.5) - (map.away_win_rate ?? 0.5)
                const edgePp = edge * 100
                const isEven = Math.abs(edgePp) < 3
                const dotClass = mapConfidenceDot(map.confidence)
                const pressureText = isEven ? 'Even' : `${edge > 0 ? '+' : ''}${edgePp.toFixed(0)} pp`
                const pressureClass = isEven
                  ? 'text-muted/70 border-border/30 bg-surface'
                  : edge > 0
                    ? 'text-accent border-accent/30 bg-accent/8'
                    : 'text-accent2 border-accent2/30 bg-accent2/8'

                return (
                  <div key={map.map} className="grid grid-cols-[140px_1fr_80px_1fr] items-center gap-x-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`shrink-0 text-[8px] leading-none ${dotClass}`}>●</span>
                      <span className="truncate font-mono text-[11px] text-text">{formatMapName(map.map)}</span>
                    </div>
                    <div className="min-w-0">
                      {map.home_win_rate != null ? (
                        <span className="font-mono text-[11px] text-accent">
                          {(map.home_win_rate * 100).toFixed(0)}%
                          <span className="ml-1 font-mono text-[9px] text-muted/55">{map.home_sample_size}m</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted/40">—</span>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wide ${pressureClass}`}>
                        {pressureText}
                      </span>
                    </div>
                    <div className="min-w-0 text-right">
                      {map.away_win_rate != null ? (
                        <span className="font-mono text-[11px] text-accent2">
                          {(map.away_win_rate * 100).toFixed(0)}%
                          <span className="ml-1 font-mono text-[9px] text-muted/55">{map.away_sample_size}m</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted/40">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Confidence legend */}
            <div className="mt-2 flex gap-3 font-mono text-[9px] text-muted/50">
              <span><span className="text-success">●</span> High</span>
              <span><span className="text-warning">●</span> Medium</span>
              <span><span className="text-muted/40">●</span> Low</span>
            </div>

            {landing.map_battlefield.veto_flow.length > 0 && (
              <div className="mt-3 rounded-lg border border-border/30 bg-surface2/20 p-2.5">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted/55">Suggested veto</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {landing.map_battlefield.veto_flow.map((step, i) => (
                    <span key={`${step.label}-${step.team}-${step.map}`} className="inline-flex items-center gap-1.5">
                      {i > 0 && <span className="font-mono text-[9px] text-muted/35">→</span>}
                      <span className={`rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-widest ${
                        step.team === 'home'
                          ? 'border-accent/30 bg-accent/10 text-accent'
                          : step.team === 'away'
                            ? 'border-accent2/30 bg-accent2/10 text-accent2'
                            : 'border-border/40 bg-surface text-muted'
                      }`}>
                        {step.label} {formatMapName(step.map)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {landing.map_battlefield.veto_flow.length === 0 && (
              <div className="mt-3 rounded-lg border border-border/30 bg-surface2/20 p-2.5">
                <p className="font-mono text-[10px] text-muted">
                  No robust veto sequence yet. The pressure map is most useful as a pressure guide, not a locked veto script.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="font-mono text-[11px] text-muted">Not enough map data to build a clear veto picture.</p>
        )}
      </AnalysisSection>

      {landing.watchlist && (
        <AnalysisSection
          title="Players to Watch"
          description="Only the three most useful reads: initiators, form, and volatility risk."
          className="border-border/45 bg-surface p-3.5 md:p-4"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {([
              { team: landing.watchlist.home, name: homeName, tone: 'home' as const },
              { team: landing.watchlist.away, name: awayName, tone: 'away' as const },
            ]).map((entry) => (
              <TeamStoryCard
                key={entry.name}
                name={entry.name}
                logoUrl={entry.tone === 'home' ? home.logo_url : away.logo_url}
                tone={entry.tone}
                players={entry.tone === 'home' ? home.players : away.players}
                watch={entry.team}
              />
            ))}
          </div>
        </AnalysisSection>
      )}
    </div>
  )
}
