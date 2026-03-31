'use client'

import { useState, useMemo } from 'react'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'
import { detectRole, ROLE_META } from '@/lib/detect-role'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import { formatReport } from '@/lib/format-report'
import { PlayerDetail } from './player-detail'
import { PredictionCard } from './prediction-card'
import { TeamComparisonBars } from './team-comparison-bars'

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-success)'
  if (score >= 0.5) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

// ── Data source badge ──────────────────────────────────────────────────────────

function DataBadge({ source }: { source: PlayerAnalysis['data_source'] }) {
  const config: Record<PlayerAnalysis['data_source'], { label: string; cls: string }> = {
    bl:       { label: 'BL',    cls: 'bg-accent/20 text-accent' },
    leetify:  { label: 'L',     cls: 'bg-success/20 text-success' },
    combined: { label: 'BL+L',  cls: 'bg-purple-500/20 text-purple-300' },
  }
  const { label, cls } = config[source]
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
  )
}

// ── Role badge ─────────────────────────────────────────────────────────────────

function RoleBadge({ player }: { player: PlayerAnalysis }) {
  const role = detectRole(player)
  if (!role) return null
  const { label, desc, colorClass } = ROLE_META[role]
  return (
    <span
      className={`text-[8px] font-mono px-1 py-px border border-current/25 rounded ${colorClass} shrink-0`}
      title={desc}
    >
      {label}
    </span>
  )
}

function TrendBadge({ player }: { player: PlayerAnalysis }) {
  if (player.leetify_prior == null) return null

  const delta = player.score - player.leetify_prior
  if (delta > 0.05) {
    return (
      <span
        className="text-[9px] font-mono text-success tabular-nums"
        title={`Over karrieresnitt (${(delta * 10).toFixed(1)})`}
      >
        ↑
      </span>
    )
  }
  if (delta < -0.05) {
    return (
      <span
        className="text-[9px] font-mono text-danger tabular-nums"
        title={`Under karrieresnitt (${(delta * 10).toFixed(1)})`}
      >
        ↓
      </span>
    )
  }
  return (
    <span
      className="text-[9px] font-mono text-muted tabular-nums"
      title="På linje med karrieresnitt"
    >
      →
    </span>
  )
}

// ── Expandable player row ──────────────────────────────────────────────────────

function PlayerRow({ player }: { player: PlayerAnalysis }) {
  const [expanded, setExpanded] = useState(false)
  const displayScore = (player.score * 10).toFixed(2)
  const displayCI = player.ci.toFixed(2)

  return (
    <div className="border-b border-border/25 last:border-0">
      {/* Clickable row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-2 px-1 -mx-1 rounded-sm hover:bg-surface2/60 transition-colors text-left cursor-pointer"
        aria-expanded={expanded}
        aria-controls={`detail-${player.paradise_user_id}`}
      >
        {/* Expand chevron */}
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

        {/* Name + role + trend */}
        <div className="flex items-center gap-1.5 w-28 shrink-0 min-w-0">
          <span className="font-mono text-xs text-text truncate">{player.name}</span>
          <RoleBadge player={player} />
          <TrendBadge player={player} />
        </div>

        {/* Power bar */}
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

        {/* Score ±CI */}
        <span
          className="w-20 shrink-0 font-mono text-xs text-right tabular-nums"
          style={{ color: scoreColor(player.score) }}
        >
          {displayScore}{' '}
          <span className="text-muted text-[10px]">±{displayCI}</span>
        </span>

        {/* Data badge */}
        <div className="w-12 shrink-0 flex justify-end">
          <DataBadge source={player.data_source} />
        </div>
      </button>

      {/* Collapsible detail panel — CSS grid trick for smooth height animation */}
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
            <PlayerDetail player={player} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Team card ──────────────────────────────────────────────────────────────────

function TeamCard({ team, accent }: { team: Team; accent: 'accent' | 'accent2' }) {
  const sorted = useMemo(
    () => [...team.players].sort((a, b) => b.score - a.score),
    [team.players],
  )
  const stats = useMemo(() => deriveTeamStats(team.players), [team.players])

  const headerColor = accent === 'accent' ? 'text-accent' : 'text-accent2'
  const borderColor = accent === 'accent' ? 'border-accent/25' : 'border-accent2/25'

  return (
    <div className={`bg-surface rounded-lg border ${borderColor} p-4`}>
      {/* Header row */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className={`font-display text-sm tracking-widest uppercase ${headerColor}`}>
          {team.name || 'Team'}
        </h2>
        <span className="font-mono text-[10px] text-muted tabular-nums">
          ⌀{' '}
          <span style={{ color: scoreColor(stats.avg_score) }}>
            {(stats.avg_score * 10).toFixed(1)}
          </span>
        </span>
      </div>

      {/* Column labels */}
      <div className="flex items-center gap-2 mb-1 px-5">
        <span className="w-28 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest">
          Spiller
        </span>
        <span className="flex-1 mx-2 text-[9px] font-mono text-muted uppercase tracking-widest">
          Ranking
        </span>
        <span className="w-20 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest text-right">
          Score ±CI
        </span>
        <span className="w-12 shrink-0 text-[9px] font-mono text-muted uppercase tracking-widest text-right">
          Kilde
        </span>
      </div>

      <div>
        {sorted.map((p) => (
          <PlayerRow key={p.paradise_user_id} player={p} />
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
        <span className="text-text/70">Runder</span>{' '}
        <span className="tabular-nums">{meta.rounds_fetched}</span>
      </span>
      <span title={meta.leetify_count === 0 && meta.leetify_attempts > 0 ? '404 — ingen Leetify-profiler funnet for disse spillerne' : undefined}>
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
    <button
      type="button"
      onClick={copyReport}
      className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded border border-border/50 bg-surface hover:bg-surface2/50 transition-colors"
      title="Kopier analyse som tekst"
    >
      {state === 'copied' ? 'Kopiert' : state === 'error' ? 'Feilet' : 'Kopier analyse'}
    </button>
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
  const matchTime = result.meta.match_start_time ?? result.meta.match_finished_time

  return (
    <div>
      {/* Matchup heading */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[10px] tracking-widest uppercase text-muted">
            Matchup
          </span>
          <span className="font-mono text-accent text-sm tabular-nums">
            #{result.matchup_id}
          </span>
          {matchTime && (
            <span className="font-mono text-[10px] text-muted tabular-nums">
              {new Date(matchTime).toLocaleString('nb-NO')}
            </span>
          )}
        </div>
        {showCopyReport && <CopyReportButton result={result} />}
      </div>

      <MetaBar meta={result.meta} />
      <PredictionCard home={result.teams.home} away={result.teams.away} />
      <TeamComparisonBars home={result.teams.home} away={result.teams.away} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TeamCard team={result.teams.home} accent="accent" />
        <TeamCard team={result.teams.away} accent="accent2" />
      </div>
    </div>
  )
}
