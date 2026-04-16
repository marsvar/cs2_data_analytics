'use client'

import Link from 'next/link'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import { TeamLogo, PlayerAvatar } from '@/components/identity-badge'
import { ROLE_META_PROFILE } from '@/lib/detect-role'
import type { TeamProfileResponse, PlayerRole, RosterMember, TeamMatchResult } from '@/lib/types'

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

function dateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit' }).format(d)
}

function mapColor(winRate: number) {
  if (winRate >= 0.6) return 'var(--color-success)'
  if (winRate >= 0.4) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function avg(arr: (number | null | undefined)[]): number | null {
  const vals = arr.filter((v): v is number => v != null && !Number.isNaN(v))
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

function cellColor(val: number | null, mean: number | null, higherIsBetter = true): string {
  if (val == null || mean == null) return 'text-text/50'
  const better = higherIsBetter ? val >= mean * 1.05 : val <= mean * 0.95
  const worse = higherIsBetter ? val <= mean * 0.95 : val >= mean * 1.05
  if (better) return 'text-success'
  if (worse) return 'text-danger'
  return 'text-text/70'
}

function formLast5(history: TeamMatchResult[]): ('W' | 'L' | '?')[] {
  return history.slice(0, 5).map((m) =>
    m.won === true ? 'W' : m.won === false ? 'L' : '?',
  )
}

function barColor(winPct: number): string {
  if (winPct >= 0.6) return 'bg-success'
  if (winPct >= 0.4) return 'bg-warning'
  return 'bg-danger'
}

function RoleBadge({ role }: { role: PlayerRole | null }) {
  if (!role) return <span className="font-mono text-[8px] text-muted/40">—</span>
  const meta = ROLE_META_PROFILE[role]
  return (
    <span className={`font-label text-[8px] uppercase tracking-widest border px-1.5 py-0.5 rounded ${meta.colorClass} border-current/25 bg-current/5`}>
      {meta.label}
    </span>
  )
}

function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const cls = confidence === 'high' ? 'text-success' : confidence === 'medium' ? 'text-warning' : 'text-danger/60'
  return <span className={`${cls} text-[10px]`}>●</span>
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface2/50 border border-border/25 rounded-lg px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted/60 mb-1">{label}</div>
      <div className="font-display text-lg tabular-nums leading-none">{value}</div>
      {sub && <div className="font-mono text-[9px] text-muted/40 mt-0.5">{sub}</div>}
    </div>
  )
}

function KeyMetricsStrip({ profile }: { profile: TeamProfileResponse }) {
  const teamKast = avg(profile.roster.map((p) => p.kast))
  const teamOd = avg(profile.roster.map((p) => p.od_rate))
  const teamDpr = avg(profile.roster.map((p) => p.dpr))
  const form = formLast5(profile.match_history)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <StatCard label="Win Rate" value={pct(profile.win_rate)} sub={`${profile.wins}W ${profile.losses}L`} />
      {teamKast != null && <StatCard label="Team KAST" value={pct(teamKast)} />}
      {teamOd != null && <StatCard label="Team OD%" value={pct(teamOd)} />}
      {teamDpr != null && <StatCard label="Avg DPR" value={teamDpr.toFixed(1)} />}
      <div className="bg-surface2/50 border border-border/25 rounded-lg px-3 py-2.5">
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted/60 mb-1">Form</div>
        <div className="flex gap-1">
          {form.length === 0 ? (
            <span className="font-mono text-[9px] text-muted/30">—</span>
          ) : (
            form.map((r, i) => (
              <span
                key={i}
                className={`w-5 h-5 rounded text-[9px] font-mono flex items-center justify-center border ${
                  r === 'W' ? 'bg-success/15 text-success border-success/30'
                  : r === 'L' ? 'bg-danger/15 text-danger border-danger/30'
                  : 'bg-surface2 text-muted/40 border-border/20'
                }`}
              >
                {r}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function PlayerBenchmarkTable({ roster }: { roster: RosterMember[] }) {
  if (roster.length === 0) {
    return <div className="px-4 py-4 font-mono text-xs text-muted/60">No player data available</div>
  }

  const meanKd = avg(roster.map((p) => p.kd))
  const meanDpr = avg(roster.map((p) => p.dpr))
  const meanKast = avg(roster.map((p) => p.kast))
  const meanOd = avg(roster.map((p) => p.od_rate))

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto_4rem_4rem_4rem_4rem_3rem] gap-x-2 px-4 py-1.5 border-b border-border/20 font-mono text-[8px] uppercase tracking-widest text-muted/40">
        <span />
        <span>Player</span>
        <span>Role</span>
        <span className="text-center">KD</span>
        <span className="text-center">DPR</span>
        <span className="text-center">KAST</span>
        <span className="text-center">OD%</span>
        <span className="text-right">Score</span>
      </div>
      <div className="divide-y divide-border/10">
        {roster.map((player) => (
          <div key={player.paradise_user_id} className="grid grid-cols-[auto_1fr_auto_4rem_4rem_4rem_4rem_3rem] gap-x-2 items-center px-4 py-2 hover:bg-surface2/15 transition-colors">
            <PlayerAvatar name={player.name} tone="neutral" size="xs" />
            <div className="min-w-0">
              <Link
                href={`/player/${player.paradise_user_id}`}
                className="font-mono text-xs text-text hover:text-accent hover:underline underline-offset-2 transition-colors truncate block"
              >
                {player.name}
              </Link>
              <span className="font-mono text-[8px] text-muted/40">{player.rounds} rds</span>
            </div>
            <RoleBadge role={player.role} />
            <div className={`font-mono text-[10px] tabular-nums text-center ${cellColor(player.kd, meanKd)}`}>
              {player.kd != null ? player.kd.toFixed(2) : '—'}
            </div>
            <div className={`font-mono text-[10px] tabular-nums text-center ${cellColor(player.dpr, meanDpr)}`}>
              {player.dpr != null ? player.dpr.toFixed(0) : '—'}
            </div>
            <div className={`font-mono text-[10px] tabular-nums text-center ${cellColor(player.kast, meanKast)}`}>
              {player.kast != null ? pct(player.kast) : '—'}
            </div>
            <div className={`font-mono text-[10px] tabular-nums text-center ${cellColor(player.od_rate, meanOd)}`}>
              {player.od_rate != null ? pct(player.od_rate) : '—'}
            </div>
            <div className="font-display text-sm tabular-nums text-text text-right">
              {player.score != null ? (player.score * 10).toFixed(1) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TeamProfileDisplay({ profile }: { profile: TeamProfileResponse }) {
  const winPct = profile.win_rate

  return (
    <div className="space-y-4">
      <div className="card-1 overflow-hidden fx-rise">
        <div className="px-5 py-5">
          <div className="flex items-start gap-4">
            <TeamLogo name={profile.team_name} logoUrl={profile.logo_url} tone="neutral" size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl md:text-2xl leading-none tracking-tight text-text mb-1">
                {profile.team_name || `Team #${profile.team_id}`}
              </h1>
              <div className="font-mono text-[10px] text-muted/60 mb-3">
                {profile.total_matches} {profile.total_matches === 1 ? 'match' : 'matches'}
                {profile.roster.length > 0 && ` · ${profile.roster.length} players`}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-success">{profile.wins}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Won</div>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-danger">{profile.losses}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Lost</div>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-text">{pct(winPct)}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Win Rate</div>
                </div>
              </div>
            </div>
          </div>

          {profile.total_matches > 0 && (
            <div className="mt-4">
              <div className="w-full bg-surface2 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${barColor(winPct)}`}
                  style={{ width: `${winPct * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fx-rise fx-rise-d1">
        <KeyMetricsStrip profile={profile} />
      </div>

      <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Roster</span>
          <span className="font-mono text-[8px] text-muted/40 uppercase tracking-widest">
            Green = above avg · Red = below avg
          </span>
        </div>
        <PlayerBenchmarkTable roster={profile.roster} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {profile.map_pool.length > 0 && (
          <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
            <div className="px-4 pt-4 pb-2">
              <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Map Pool</span>
            </div>
            <div className="px-1">
              <ResponsiveContainer width="100%" height={Math.max(110, profile.map_pool.slice(0, 7).length * 28)}>
                <BarChart
                  data={profile.map_pool.slice(0, 7).map((m) => ({
                    map: m.map.replace('de_', ''),
                    win_rate: Math.round(m.win_rate * 100),
                    played: m.played,
                    confidence: m.confidence,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 50, bottom: 0, left: 10 }}
                >
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="map" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    formatter={(value: number, _: string, props) => [`${value}% (${props.payload.played} matches)`, 'Win Rate']}
                  />
                  <Bar dataKey="win_rate" radius={[0, 3, 3, 0]}>
                    {profile.map_pool.slice(0, 7).map((entry, i) => (
                      <Cell key={i} fill={mapColor(entry.win_rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
              {profile.map_pool.slice(0, 7).map((m) => (
                <span key={m.map} className="font-mono text-[8px] text-muted/50 flex items-center gap-1">
                  <ConfidenceDot confidence={m.confidence} />
                  {m.map.replace('de_', '')} {m.played}×
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.match_history.length > 0 && (
          <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d3">
            <div className="px-4 pt-4 pb-2">
              <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Match History</span>
            </div>
            <div className="grid grid-cols-[3rem_1fr_4rem_2.5rem_5rem] gap-2 px-4 py-2 border-b border-border/20 font-mono text-[9px] uppercase tracking-widest text-muted/50">
              <span>Date</span>
              <span>Opponent</span>
              <span className="text-center">Score</span>
              <span className="text-center">W/L</span>
              <span className="text-right">Analysis</span>
            </div>
            <div className="divide-y divide-border/10 max-h-80 overflow-y-auto">
              {profile.match_history.slice(0, 20).map((m) => (
                <div key={m.matchup_id} className="grid grid-cols-[3rem_1fr_4rem_2.5rem_5rem] gap-2 items-center px-4 py-2.5 hover:bg-surface2/15 transition-colors">
                  <span className="font-mono text-[9px] text-muted/50 tabular-nums">{dateShort(m.date)}</span>
                  <div className="min-w-0">
                    {m.opponent_id > 0 ? (
                      <Link
                        href={`/team/${m.opponent_id}`}
                        className="font-mono text-xs text-text/80 hover:text-accent hover:underline underline-offset-2 truncate block transition-colors"
                      >
                        {m.opponent_name || `Team #${m.opponent_id}`}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-text/80 truncate block">
                        {m.opponent_name || '—'}
                      </span>
                    )}
                    {m.map && (
                      <span className="font-mono text-[9px] text-muted/40">{m.map.replace('de_', '')}</span>
                    )}
                  </div>
                  <div className="text-center font-display text-xs tabular-nums">
                    {m.home_score != null && m.away_score != null ? (
                      <span>
                        <span className={m.home_or_away === 'home' && (m.home_score ?? 0) > (m.away_score ?? 0) ? 'text-success' : 'text-text/60'}>
                          {m.home_score}
                        </span>
                        <span className="text-muted/30 mx-0.5">–</span>
                        <span className={m.home_or_away === 'away' && (m.away_score ?? 0) > (m.home_score ?? 0) ? 'text-success' : 'text-text/60'}>
                          {m.away_score}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted/30">—</span>
                    )}
                  </div>
                  <div className="text-center">
                    <span className={`font-mono text-[9px] uppercase tracking-widest px-1 py-0.5 rounded border ${
                      m.won === true ? 'text-success border-success/30 bg-success/8'
                      : m.won === false ? 'text-danger border-danger/30 bg-danger/8'
                      : 'text-muted border-border/20'
                    }`}>
                      {m.won === true ? 'W' : m.won === false ? 'L' : '?'}
                    </span>
                  </div>
                  <div className="text-right">
                    <Link
                      href={`/match/${m.matchup_id}`}
                      className="font-mono text-[9px] uppercase tracking-widest text-accent/60 hover:text-accent border border-accent/15 hover:border-accent/40 px-2 py-1 rounded transition-colors"
                    >
                      Analysis
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 pb-4">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
          ← Back to search
        </Link>
      </div>
    </div>
  )
}
