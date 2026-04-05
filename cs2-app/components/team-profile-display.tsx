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
import { EconomyFlow } from '@/components/economy-flow'
import { ROLE_META_PROFILE } from '@/lib/detect-role'
import type { TeamProfileResponse, PlayerRole } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

function dateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit' }).format(d)
}

function mapColor(winRate: number) {
  if (winRate >= 0.6) return 'var(--color-success)'
  if (winRate >= 0.4) return 'var(--color-warning)'
  return 'var(--color-danger)'
}

function RoleBadge({ role }: { role: PlayerRole | null }) {
  if (!role) return <span className="font-mono text-[8px] text-muted/40">—</span>
  const meta = ROLE_META_PROFILE[role]
  return (
    <span className={`font-mono text-[8px] uppercase tracking-widest border px-1.5 py-0.5 rounded ${meta.colorClass} border-current/25 bg-current/5`}>
      {meta.label}
    </span>
  )
}

// ── Role distribution segmented bar ──────────────────────────────────────────

function RoleDistBar({ dist, total }: { dist: Partial<Record<PlayerRole, number>>; total: number }) {
  if (total === 0) return null
  const roles: PlayerRole[] = ['entry', 'awper', 'support', 'lurker', 'igl', 'hybrid']
  const segments = roles.filter((r) => (dist[r] ?? 0) > 0)

  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {segments.map((role) => {
        const count = dist[role] ?? 0
        const width = (count / total) * 100
        const meta = ROLE_META_PROFILE[role]
        return (
          <div
            key={role}
            style={{ width: `${width}%`, background: 'currentColor' }}
            className={`${meta.colorClass} opacity-60`}
            title={`${meta.label}: ${count}`}
          />
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeamProfileDisplay({ profile }: { profile: TeamProfileResponse }) {
  const winPct = profile.win_rate

  return (
    <div className="space-y-4">

      {/* ── Section 1: Header ── */}
      <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise">
        <div className="px-5 py-5">
          <div className="flex items-start gap-4">
            <TeamLogo name={profile.team_name} logoUrl={profile.logo_url} tone="neutral" size="lg" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl md:text-2xl leading-none tracking-tight text-text mb-1">
                {profile.team_name || `Lag #${profile.team_id}`}
              </h1>
              <div className="font-mono text-[10px] text-muted/60 mb-3">
                {profile.total_matches} {profile.total_matches === 1 ? 'kamp' : 'kamper'}
                {profile.roster.length > 0 && ` · ${profile.roster.length} spillere`}
              </div>

              {/* W/L record */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-success">{profile.wins}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Vunnet</div>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-danger">{profile.losses}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Tapt</div>
                </div>
                <div className="w-px h-8 bg-border/30" />
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-text">{pct(winPct)}</div>
                  <div className="font-mono text-[8px] text-muted/50 uppercase tracking-widest">Vinnrate</div>
                </div>
              </div>
            </div>
          </div>

          {/* Win rate bar */}
          {profile.total_matches > 0 && (
            <div className="mt-4">
              <div className="w-full bg-surface2 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${winPct * 100}%`,
                    background: winPct >= 0.6 ? 'var(--color-success)' : winPct >= 0.4 ? 'var(--color-warning)' : 'var(--color-danger)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Section 2: Map pool ── */}
        {profile.map_pool.length > 0 && (
          <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d1">
            <div className="px-4 pt-4 pb-2">
              <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Kartpool</span>
            </div>
            <div className="px-1 pb-4">
              <ResponsiveContainer width="100%" height={Math.max(110, profile.map_pool.slice(0, 7).length * 28)}>
                <BarChart
                  data={profile.map_pool.slice(0, 7).map((m) => ({
                    map: m.map.replace('de_', ''),
                    win_rate: Math.round(m.win_rate * 100),
                    played: m.played,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 50, bottom: 0, left: 10 }}
                >
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="map" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    formatter={(value: number, _: string, props) => [`${value}% (${props.payload.played} kamper)`, 'Vinnrate']}
                  />
                  <Bar dataKey="win_rate" radius={[0, 3, 3, 0]}>
                    {profile.map_pool.slice(0, 7).map((entry, i) => (
                      <Cell key={i} fill={mapColor(entry.win_rate)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Section 3: Roster ── */}
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d1">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Roster</span>
          </div>
          <div className="divide-y divide-border/15">
            {profile.roster.length === 0 ? (
              <div className="px-4 py-4 font-mono text-xs text-muted/60">Ingen spillerdata tilgjengelig</div>
            ) : (
              profile.roster.map((player) => (
                <div key={player.paradise_user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <PlayerAvatar name={player.name} tone="neutral" size="xs" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/player/${player.paradise_user_id}`}
                      className="font-mono text-xs text-text hover:text-accent hover:underline underline-offset-2 transition-colors truncate block"
                    >
                      {player.name}
                    </Link>
                    <div className="font-mono text-[9px] text-muted/50 mt-0.5">{player.rounds} runder</div>
                  </div>
                  <RoleBadge role={player.role} />
                  {player.score != null && (
                    <div className="font-display text-sm tabular-nums text-text w-8 text-right">
                      {(player.score * 10).toFixed(1)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Section 4: Composition ── */}
      {(profile.composition_notes.length > 0 || profile.playstyle_summary) && (
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Lagsammensetning</span>
          </div>
          <div className="px-4 pb-4 space-y-3">
            {/* Role distribution bar */}
            {profile.roster.length > 0 && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-1.5">Rollefordeling</div>
                <RoleDistBar dist={profile.role_distribution} total={profile.roster.length} />
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {(Object.entries(profile.role_distribution) as [PlayerRole, number][]).map(([role, count]) => {
                    const meta = ROLE_META_PROFILE[role]
                    return (
                      <span key={role} className={`font-mono text-[9px] ${meta.colorClass}`}>
                        {meta.label} ×{count}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Playstyle summary */}
            {profile.playstyle_summary && (
              <blockquote className="border-l-2 border-accent/30 pl-3">
                <p className="font-mono text-[11px] text-text/80 leading-relaxed">{profile.playstyle_summary}</p>
              </blockquote>
            )}

            {/* Composition notes */}
            {profile.composition_notes.length > 0 && (
              <ul className="space-y-1">
                {profile.composition_notes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-muted/40" />
                    <span className="font-mono text-[10px] text-muted/70">{note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Section 5: Economy notes ── */}
      {profile.economy_notes.length > 0 && (
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Økonomiproxy</span>
          </div>
          <div className="px-4 pb-4">
            <EconomyFlow notes={profile.economy_notes} />
          </div>
        </div>
      )}

      {/* ── Section 6: Match history ── */}
      {profile.match_history.length > 0 && (
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d3">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Kamphistorikk</span>
          </div>
          {/* Header */}
          <div className="grid grid-cols-[3rem_1fr_4rem_2.5rem_5rem] gap-2 px-4 py-2 border-b border-border/20 font-mono text-[9px] uppercase tracking-widest text-muted/50">
            <span>Dato</span>
            <span>Motstander</span>
            <span className="text-center">Score</span>
            <span className="text-center">Res.</span>
            <span className="text-right">Analyse</span>
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
                      {m.opponent_name || `Lag #${m.opponent_id}`}
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
                    {m.won === true ? 'V' : m.won === false ? 'T' : '?'}
                  </span>
                </div>
                <div className="text-right">
                  <Link
                    href={`/match/${m.matchup_id}`}
                    className="font-mono text-[9px] uppercase tracking-widest text-accent/60 hover:text-accent border border-accent/15 hover:border-accent/40 px-2 py-1 rounded transition-colors"
                  >
                    Analyse
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Back navigation ── */}
      <div className="pt-2 pb-4">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
          ← Tilbake til søk
        </Link>
      </div>

    </div>
  )
}
