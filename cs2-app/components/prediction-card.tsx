'use client'

import { useMemo } from 'react'
import type { Team } from '@/lib/types'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import { winProbability, roundedProbability } from '@/lib/win-probability'
import { PlayerAvatar, TeamLogo } from './identity-badge'

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

      {/* Win probability — typografi-fokus */}
      <div className="flex items-stretch mb-5">
        <div className="flex-1 text-center py-3 border-r border-border/50">
          <div
            className="font-mono text-4xl font-bold tabular-nums leading-none"
            style={{ color: 'var(--color-accent)' }}
          >
            {homeWinPct}%
          </div>
          <div className="inline-flex items-center justify-center gap-1.5 mt-2">
            <TeamLogo name={homeName} logoUrl={home.logo_url} tone="home" size="sm" />
            <span className="font-mono text-[9px] text-muted uppercase tracking-widest truncate max-w-[80px]" title={homeName}>
              {homeName}
            </span>
          </div>
          <div className="font-mono text-[8px] text-muted/50 mt-0.5">seier</div>
        </div>
        <div className="flex-1 text-center py-3">
          <div
            className="font-mono text-4xl font-bold tabular-nums leading-none"
            style={{ color: 'var(--color-accent2)' }}
          >
            {awayWinPct}%
          </div>
          <div className="inline-flex items-center justify-center gap-1.5 mt-2">
            <TeamLogo name={awayName} logoUrl={away.logo_url} tone="away" size="sm" />
            <span className="font-mono text-[9px] text-muted uppercase tracking-widest truncate max-w-[80px]" title={awayName}>
              {awayName}
            </span>
          </div>
          <div className="font-mono text-[8px] text-muted/50 mt-0.5">seier</div>
        </div>
      </div>

      {/* Key threats */}
      <div className="pt-4 border-t border-border/40">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-2">Nøkkelspillere</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            {homeThreats.map((p) => (
              <div key={p.paradise_user_id} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <PlayerAvatar name={p.name} imageUrl={p.avatar_url} tone="home" size="xs" />
                  <span className="font-mono text-xs text-text truncate">{p.name}</span>
                </span>
                <span className="font-mono text-xs tabular-nums shrink-0" style={{ color: scoreColor(p.score) }}>
                  {(p.score * 10).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {awayThreats.map((p) => (
              <div key={p.paradise_user_id} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <PlayerAvatar name={p.name} imageUrl={p.avatar_url} tone="away" size="xs" />
                  <span className="font-mono text-xs text-text truncate">{p.name}</span>
                </span>
                <span className="font-mono text-xs tabular-nums shrink-0" style={{ color: scoreColor(p.score) }}>
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
