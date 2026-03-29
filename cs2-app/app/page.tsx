'use client'

import { useMemo, useState } from 'react'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return 'var(--color-success)'
  if (score >= 0.5) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

// ── Sub-components (module level) ──────────────────────────────────────────

function DataBadge({ source }: { source: PlayerAnalysis['data_source'] }) {
  const config = {
    bl: { label: 'BL', className: 'bg-accent/20 text-accent' },
    leetify: { label: 'Leetify', className: 'bg-success/20 text-success' },
    combined: { label: 'BL+L', className: 'bg-purple-500/20 text-purple-300' },
  }
  const { label, className } = config[source]
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${className}`}>
      {label}
    </span>
  )
}

function PlayerRow({ player }: { player: PlayerAnalysis }) {
  const displayScore = (player.score * 10).toFixed(2)
  const displayCI = (player.ci * 10).toFixed(2)

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
      {/* Name */}
      <span className="w-28 shrink-0 font-mono text-xs text-text truncate">
        {player.name}
      </span>

      {/* Power bar */}
      <div className="relative flex-1 h-1 bg-surface2 rounded-full mx-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${player.score * 100}%`, background: scoreColor(player.score) }}
        />
      </div>

      {/* Score ±CI */}
      <span
        className="w-20 shrink-0 font-mono text-xs text-right tabular-nums"
        style={{ color: scoreColor(player.score) }}
      >
        {displayScore} <span className="text-muted">±{displayCI}</span>
      </span>

      {/* Data badge */}
      <div className="shrink-0 w-14 flex justify-end">
        <DataBadge source={player.data_source} />
      </div>
    </div>
  )
}

function TeamCard({ team, accent }: { team: Team; accent: 'accent' | 'accent2' }) {
  const sorted = useMemo(
    () => [...team.players].sort((a, b) => b.score - a.score),
    [team.players]
  )

  const headerColor = accent === 'accent' ? 'text-accent' : 'text-accent2'
  const borderColor = accent === 'accent' ? 'border-accent/40' : 'border-accent2/40'

  return (
    <div className={`bg-surface rounded-lg border ${borderColor} p-4`}>
      {/* Team header */}
      <h2 className={`font-display text-sm tracking-widest uppercase mb-4 ${headerColor}`}>
        {team.name !== '' ? team.name : 'Team'}
      </h2>

      {/* Column headings */}
      <div className="flex items-center gap-2 mb-1 px-0">
        <span className="w-28 shrink-0 text-[10px] font-mono text-muted uppercase tracking-wider">
          Spiller
        </span>
        <span className="flex-1 mx-2 text-[10px] font-mono text-muted uppercase tracking-wider">
          Ranking
        </span>
        <span className="w-20 shrink-0 text-[10px] font-mono text-muted uppercase tracking-wider text-right">
          Score ±CI
        </span>
        <span className="w-14 shrink-0 text-[10px] font-mono text-muted uppercase tracking-wider text-right">
          Kilde
        </span>
      </div>

      {/* Player rows */}
      <div>
        {sorted.map((p) => (
          <PlayerRow key={p.paradise_user_id} player={p} />
        ))}
      </div>
    </div>
  )
}

function MetaBar({ meta }: { meta: AnalyzeResponse['meta'] }) {
  return (
    <div className="flex flex-wrap gap-4 text-[11px] font-mono text-muted bg-surface rounded-md px-4 py-2 border border-border mb-6">
      <span>
        <span className="text-text">Runder:</span> {meta.rounds_fetched}
      </span>
      <span>
        <span className="text-text">Leetify:</span> {meta.leetify_count}
      </span>
      <span>
        <span className="text-text">Kilder:</span> {meta.data_sources.join(', ')}
      </span>
      <span>
        <span className="text-text">Tid:</span> {meta.duration_ms}ms
      </span>
    </div>
  )
}

function AnalysisDisplay({ result }: { result: AnalyzeResponse }) {
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-display text-xs tracking-widest uppercase text-muted">
          Matchup
        </span>
        <span className="font-mono text-accent text-sm">#{result.matchup_id}</span>
      </div>

      <MetaBar meta={result.meta} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TeamCard team={result.teams.home} accent="accent" />
        <TeamCard team={result.teams.away} accent="accent2" />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  async function runAnalysis() {
    const id = input.trim()
    if (!id || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/analyze?matchup_id=${encodeURIComponent(id)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`)
      } else {
        setResult(data as AnalyzeResponse)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ukjent nettverksfeil')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      runAnalysis()
    }
  }

  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="font-display text-2xl tracking-widest uppercase text-accent">
          CS2 Analyse
        </h1>
        <p className="text-muted text-sm mt-1 font-mono">
          Bedriftsligaen · Bayesiansk vekting · BL API + Leetify
        </p>
      </header>

      {/* Search form */}
      <div className="flex gap-3 items-center">
        <label htmlFor="matchup-input" className="sr-only">Matchup ID</label>
        <input
          id="matchup-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Matchup ID, f.eks. 15810"
          disabled={loading}
          className={[
            'flex-1 bg-surface border border-border rounded-md',
            'px-4 py-2.5 font-mono text-sm text-text',
            'placeholder:text-muted',
            'focus:outline-none focus:border-accent',
            'disabled:opacity-50',
          ].join(' ')}
        />
        <button
          onClick={runAnalysis}
          disabled={loading || input.trim() === ''}
          className={[
            'px-5 py-2.5 rounded-md font-mono text-sm tracking-wide',
            'bg-accent text-white',
            'hover:bg-accent/80 transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {loading ? 'Analyserer…' : 'Analyser'}
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <p className="mt-6 font-mono text-xs text-muted animate-pulse">
          Henter kampdata og Leetify-profiler…
        </p>
      ) : null}

      {/* Error state */}
      {error !== null ? (
        <p className="mt-6 font-mono text-xs text-danger">
          Feil: {error}
        </p>
      ) : null}

      {/* Result */}
      {result !== null ? <AnalysisDisplay result={result} /> : null}
    </main>
  )
}
