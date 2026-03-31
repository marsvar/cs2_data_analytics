'use client'

import { useMemo } from 'react'
import type { Team } from '@/lib/types'
import { deriveTeamStats } from '@/lib/derive-team-stats'

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

  return (
    <div className="bg-surface border border-border/50 rounded-lg p-5 mb-6">
      <h2 className="font-display text-[11px] tracking-widest uppercase text-muted mb-4">
        Lagsammenligning
      </h2>

      {/* Team name headers */}
      <div className="grid grid-cols-[1fr_52px_1fr] mb-3">
        <span className="font-mono text-xs text-accent text-right truncate pr-2">
          {home.name || 'Hjemmelag'}
        </span>
        <span />
        <span className="font-mono text-xs text-accent2 truncate pl-2">
          {away.name || 'Bortelag'}
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
    </div>
  )
}
