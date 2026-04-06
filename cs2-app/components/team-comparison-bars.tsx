'use client'

import { useMemo } from 'react'
import type { Team } from '@/lib/types'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import { TeamLogo } from './identity-badge'

type StatDef = {
  key: string
  label: string
  normalize: (v: number) => number
  format: (v: number) => string
}

const STATS: StatDef[] = [
  {
    key: 'dpr',
    label: 'DPR',
    normalize: (v) => Math.min(v / 120, 1),
    format: (v) => v.toFixed(1),
  },
  {
    key: 'kast',
    label: 'KAST',
    normalize: (v) => v,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'od',
    label: 'OD%',
    normalize: (v) => v,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'kd',
    label: 'K/D',
    normalize: (v) => Math.min(v / 2, 1),
    format: (v) => v.toFixed(2),
  },
  {
    key: 'score',
    label: 'Samlet',
    normalize: (v) => v,
    format: (v) => (v * 10).toFixed(1),
  },
]

const AIM_STAT: StatDef = {
  key: 'aim',
  label: 'Sikte',
  normalize: (v) => Math.min(Math.max(v / 100, 0), 1),
  format: (v) => `${Math.round(v)}`,
}

function StatRow({
  def,
  homeVal,
  awayVal,
}: {
  def: StatDef
  homeVal: number
  awayVal: number
}) {
  const homeNorm = Math.min(Math.max(def.normalize(homeVal), 0), 1)
  const awayNorm = Math.min(Math.max(def.normalize(awayVal), 0), 1)
  const homeLeads = homeVal >= awayVal

  return (
    <div className="grid grid-cols-[1fr_52px_1fr] items-center gap-2">
      {/* Home side (bar grows toward center from left) */}
      <div className="flex items-center justify-end gap-2">
        <span
          className={`font-mono text-[11px] tabular-nums ${homeLeads ? 'text-text' : 'text-muted'}`}
        >
          {def.format(homeVal)}
        </span>
        <div className="w-20 h-1.5 bg-surface2 rounded-full overflow-hidden flex justify-end">
          <div
            className="h-full rounded-full"
            style={{
              width: `${homeNorm * 100}%`,
              background: 'var(--color-accent)',
              opacity: homeLeads ? 1 : 0.5,
              transition: 'width 500ms ease',
            }}
          />
        </div>
      </div>

      {/* Stat label (center) */}
      <span className="font-mono text-[9px] text-muted uppercase tracking-widest text-center">
        {def.label}
      </span>

      {/* Away side (bar grows from center toward right) */}
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${awayNorm * 100}%`,
              background: 'var(--color-accent2)',
              opacity: !homeLeads ? 1 : 0.5,
              transition: 'width 500ms ease',
            }}
          />
        </div>
        <span
          className={`font-mono text-[11px] tabular-nums ${!homeLeads ? 'text-text' : 'text-muted'}`}
        >
          {def.format(awayVal)}
        </span>
      </div>
    </div>
  )
}

export function TeamComparisonBars({ home, away }: { home: Team; away: Team }) {
  const hs = useMemo(() => deriveTeamStats(home.players), [home.players])
  const as_ = useMemo(() => deriveTeamStats(away.players), [away.players])
  const homeCoverage = home.players.length > 0 ? hs.leetify_count / home.players.length : 0
  const awayCoverage = away.players.length > 0 ? as_.leetify_count / away.players.length : 0
  const showAim = homeCoverage >= 0.5 && awayCoverage >= 0.5 && hs.avg_aim != null && as_.avg_aim != null

  const values: Record<string, [number, number]> = {
    dpr:   [hs.avg_dpr,      as_.avg_dpr],
    kast:  [hs.avg_kast,     as_.avg_kast],
    od:    [hs.avg_od_rate,  as_.avg_od_rate],
    kd:    [hs.avg_kd,       as_.avg_kd],
    score: [hs.avg_score,    as_.avg_score],
  }

  const showSideSplit = hs.avg_ct_od != null && as_.avg_ct_od != null
    && hs.avg_t_od != null && as_.avg_t_od != null

  const CT_STAT: StatDef = {
    key: 'ct_od',
    label: 'CT OD%',
    normalize: (v) => v,
    format: (v) => `${Math.round(v * 100)}%`,
  }
  const T_STAT: StatDef = {
    key: 't_od',
    label: 'T OD%',
    normalize: (v) => v,
    format: (v) => `${Math.round(v * 100)}%`,
  }

  return (
    <div className="bg-surface border border-border/50 rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-[11px] tracking-widest uppercase text-muted">
          Team comparison
        </h2>
        <span className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">BL-liga</span>
      </div>

      {/* Team name headers */}
      <div className="grid grid-cols-[1fr_52px_1fr] mb-3">
        <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs text-accent text-right truncate pr-2">
          <TeamLogo name={home.name || 'Home'} logoUrl={home.logo_url} tone="home" size="sm" />
          {home.name || 'Home'}
        </span>
        <span />
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-accent2 truncate pl-2">
          <TeamLogo name={away.name || 'Away'} logoUrl={away.logo_url} tone="away" size="sm" />
          {away.name || 'Away'}
        </span>
      </div>

      <div className="space-y-3">
        {STATS.map((def) => {
          const [hv, av] = values[def.key]
          return <StatRow key={def.key} def={def} homeVal={hv} awayVal={av} />
        })}
        {showAim && (
          <StatRow
            def={AIM_STAT}
            homeVal={hs.avg_aim ?? 0}
            awayVal={as_.avg_aim ?? 0}
          />
        )}
      </div>

      {showSideSplit && (
        <>
          <div className="flex items-center gap-2 mt-4 mb-2">
            <div className="h-px flex-1 bg-border/30" />
            <span className="font-mono text-[8px] uppercase tracking-widest text-muted/60">Side-split (Leetify matchmaking)</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
          <div className="space-y-3">
            <StatRow def={CT_STAT} homeVal={hs.avg_ct_od!} awayVal={as_.avg_ct_od!} />
            <StatRow def={T_STAT} homeVal={hs.avg_t_od!} awayVal={as_.avg_t_od!} />
          </div>
        </>
      )}
    </div>
  )
}
