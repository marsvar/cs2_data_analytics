'use client'

import { useMemo } from 'react'
import type { Team } from '@/lib/types'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import { winProbability, roundedProbability } from '@/lib/win-probability'

function WarnIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M5 1L9.33 8.5H0.67L5 1Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" />
      <line x1="5" y1="4" x2="5" y2="6.2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="5" cy="7.4" r="0.45" fill="currentColor" />
    </svg>
  )
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-success)'
  if (score >= 0.5) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

export function PredictionCard({ home, away }: { home: Team; away: Team }) {
  const homeStats = useMemo(() => deriveTeamStats(home.players), [home.players])
  const awayStats = useMemo(() => deriveTeamStats(away.players), [away.players])

  const rawHomeP = winProbability(homeStats.avg_score, awayStats.avg_score)
  const homeWinP = roundedProbability(rawHomeP)
  const homeWinPct = Math.round(homeWinP * 100)
  const awayWinPct = 100 - homeWinPct

  const lowConfidence = homeStats.avg_rounds < 50 || awayStats.avg_rounds < 50
  const uncertainAnalysis = [...home.players, ...away.players]
    .some((p) => p.ci > (p.score * 10) / 2)

  const homeThreats = useMemo(
    () => [...home.players].sort((a, b) => b.score - a.score).slice(0, 2),
    [home.players],
  )
  const awayThreats = useMemo(
    () => [...away.players].sort((a, b) => b.score - a.score).slice(0, 2),
    [away.players],
  )

  const homeName = home.name || 'Hjemmelag'
  const awayName = away.name || 'Bortelag'

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[11px] tracking-widest uppercase text-muted">
          Taktisk vurdering
        </h2>
        {lowConfidence && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-warning">
            <WarnIcon />
            <span>Lav konfidans (&lt;50 runder/sn.)</span>
          </div>
        )}
      </div>
      {uncertainAnalysis && (
        <div className="mb-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-[10px] font-mono text-warning">
          Usikker analyse: minst én spiller har CI større enn halvparten av score.
        </div>
      )}

      {/* Team names */}
      <div className="flex justify-between mb-2">
        <span className="font-mono text-xs text-accent truncate max-w-[40%]" title={homeName}>
          {homeName}
        </span>
        <span className="font-mono text-xs text-accent2 truncate max-w-[40%] text-right" title={awayName}>
          {awayName}
        </span>
      </div>

      {/* Probability bar */}
      <div className="relative h-4 bg-surface2 rounded-full overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-700 ease-out"
          style={{ width: `${homeWinPct}%`, background: 'var(--color-accent)' }}
        />
        {/* 50% marker */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
      </div>

      {/* Percentages */}
      <div className="flex justify-between mb-5">
        <span className="font-mono text-xl tabular-nums font-bold" style={{ color: 'var(--color-accent)' }}>
          {homeWinPct}%
        </span>
        <span className="font-mono text-[10px] text-muted self-center">seierssannsynlighet</span>
        <span className="font-mono text-xl tabular-nums font-bold" style={{ color: 'var(--color-accent2)' }}>
          {awayWinPct}%
        </span>
      </div>

      {/* Key threats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/40">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-2">
            Nøkkelspillere
          </p>
          <div className="space-y-1.5">
            {homeThreats.map((p) => (
              <div key={p.paradise_user_id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-text truncate">{p.name}</span>
                <span
                  className="font-mono text-xs tabular-nums shrink-0"
                  style={{ color: scoreColor(p.score) }}
                >
                  {(p.score * 10).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-2">
            Nøkkelspillere
          </p>
          <div className="space-y-1.5">
            {awayThreats.map((p) => (
              <div key={p.paradise_user_id} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-text truncate">{p.name}</span>
                <span
                  className="font-mono text-xs tabular-nums shrink-0"
                  style={{ color: scoreColor(p.score) }}
                >
                  {(p.score * 10).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
