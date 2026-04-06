'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts'
import { PlayerAvatar } from '@/components/identity-badge'
import { RadarChart } from '@/components/radar-chart'
import { ROLE_META_PROFILE } from '@/lib/detect-role'
import type { PlayerProfileResponse, PerformanceTrendPoint } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }
function round2(v: number) { return Math.round(v * 100) / 100 }

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

function ConfBadge({ conf }: { conf: 'low' | 'medium' | 'high' }) {
  const cls = conf === 'high' ? 'text-success/70 border-success/20' : conf === 'medium' ? 'text-warning/70 border-warning/20' : 'text-muted/60 border-border/30'
  return (
    <span className={`font-mono text-[8px] uppercase tracking-widest border px-1 py-0.5 rounded ${cls}`}>
      {conf === 'high' ? 'good data' : conf === 'medium' ? 'ok data' : 'low data'}
    </span>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface2/50 border border-border/25 rounded-lg px-3 py-2.5 min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted/60 mb-1 truncate">{label}</div>
      <div className="font-display text-xl tabular-nums text-text">{value}</div>
      {sub && <div className="font-mono text-[9px] text-muted/50 mt-0.5">{sub}</div>}
    </div>
  )
}

// Convert profile to PlayerAnalysis shape for RadarChart
function profileToPlayerAnalysis(p: PlayerProfileResponse) {
  return {
    name: p.name,
    paradise_user_id: p.paradise_user_id,
    steam64: p.steam64,
    avatar_url: p.avatar_url,
    score: p.score,
    ci: p.ci,
    rounds: p.total_rounds,
    assists: 0,
    kd: p.kd,
    kast: p.kast,
    dpr: p.dpr,
    hs: p.hs,
    od_rate: p.od_rate,
    leetify: p.leetify,
    data_source: p.data_source,
  }
}

// ── Trend section ─────────────────────────────────────────────────────────────

type TrendWindow = 'last5' | 'last10' | 'last20'

function TrendSection({ trend }: { trend: PlayerProfileResponse['trend'] }) {
  const [window, setWindow] = useState<TrendWindow>('last10')
  const points: PerformanceTrendPoint[] = trend[window]

  const chartData = [...points].reverse().map((p, i) => ({
    label: p.date ? dateShort(p.date) : `K${i + 1}`,
    score: round2(p.score * 10),
    kd: round2(p.kd),
    won: p.won,
    map: p.map ?? '',
  }))

  if (chartData.length === 0) {
    return (
      <div className="px-4 py-5 font-mono text-xs text-muted/60">No trend data available</div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 px-4 pt-4">
        <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Performance Trend</span>
        <div className="flex gap-1">
          {(['last5', 'last10', 'last20'] as TrendWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded border transition-colors ${
                window === w
                  ? 'border-accent/50 text-accent bg-accent/8'
                  : 'border-border/30 text-muted/60 hover:text-text'
              }`}
            >
              {w === 'last5' ? '5K' : w === 'last10' ? '10K' : '20K'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-1 pb-4">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font-mono)' }}
              labelStyle={{ color: 'var(--color-text)', marginBottom: 2 }}
              itemStyle={{ color: 'var(--color-muted)' }}
              formatter={(value: number, name: string) => [value, name === 'score' ? 'Score (/10)' : 'K/D']}
            />
            <Line type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={1.5} dot={{ r: 3, fill: 'var(--color-accent)' }} name="score" />
            <Line type="monotone" dataKey="kd" stroke="var(--color-accent2)" strokeWidth={1.5} dot={{ r: 3, fill: 'var(--color-accent2)' }} name="kd" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 px-2 mt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent inline-block rounded" />
            <span className="font-mono text-[9px] text-muted/60">Score (/10)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent2 inline-block rounded" />
            <span className="font-mono text-[9px] text-muted/60">K/D</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Map performance ───────────────────────────────────────────────────────────

function MapSection({ records }: { records: PlayerProfileResponse['map_records'] }) {
  if (records.length === 0) {
    return <div className="px-4 py-5 font-mono text-xs text-muted/60">Ingen kartdata tilgjengelig</div>
  }

  const chartData = records.slice(0, 8).map((r) => ({
    map: r.map.replace('de_', ''),
    win_rate: round2(r.win_rate * 100),
    played: r.played,
    conf: r.confidence,
  }))

  return (
    <div className="px-1 pb-4 pt-4">
      <div className="px-3 mb-3">
        <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Per Map</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 28)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 10 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="map" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            contentStyle={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 10, fontFamily: 'var(--font-mono)' }}
            formatter={(value: number) => [`${value}%`, 'Vinnrate']}
          />
          <Bar dataKey="win_rate" radius={[0, 3, 3, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={mapColor(entry.win_rate / 100)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* W/L records */}
      <div className="mt-3 px-3 space-y-1">
        {records.slice(0, 8).map((r) => (
          <div key={r.map} className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] text-muted/60 w-20 truncate">{r.map.replace('de_', '')}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] tabular-nums">
                <span className="text-success">{r.wins}V</span>
                <span className="text-muted/40 mx-0.5">–</span>
                <span className="text-danger">{r.losses}T</span>
              </span>
              <ConfBadge conf={r.confidence} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayerProfileDisplay({ profile }: { profile: PlayerProfileResponse }) {
  const roleMeta = ROLE_META_PROFILE[profile.role]
  const scoreDisplay = (profile.score * 10).toFixed(2)
  const playerAnalysis = profileToPlayerAnalysis(profile)

  return (
    <div className="space-y-4">

      {/* ── Section 1: Hero ── */}
      <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise">
        <div className="px-5 py-5">
          <div className="flex items-start gap-4">
            <PlayerAvatar name={profile.name} imageUrl={profile.avatar_url} tone="neutral" size="md" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="font-display text-xl md:text-2xl leading-none tracking-tight text-text">
                  {profile.name || `Spiller #${profile.paradise_user_id}`}
                </h1>
                <span className={`font-mono text-[9px] uppercase tracking-widest border px-2 py-0.5 rounded ${roleMeta.colorClass} border-current/30 bg-current/5`}>
                  {roleMeta.label}
                </span>
                {profile.role_confidence !== 'high' && (
                  <span className="font-mono text-[8px] text-muted/50 border border-border/20 px-1.5 py-0.5 rounded">
                    {profile.role_confidence === 'low' ? 'low data' : 'medium confidence'}
                  </span>
                )}
              </div>
              {profile.role_signals.length > 0 && (
                <p className="font-mono text-[10px] text-muted/60 mb-2">
                  {profile.role_signals.join(' · ')}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {profile.leetify?.premier && (
                  <span className="font-mono text-[9px] text-accent/80 border border-accent/20 bg-accent/5 px-1.5 py-0.5 rounded">
                    Premier {profile.leetify.premier.toLocaleString()}
                  </span>
                )}
                {profile.leetify?.faceit_level && (
                  <span className="font-mono text-[9px] text-warning/80 border border-warning/20 bg-warning/5 px-1.5 py-0.5 rounded">
                    FACEIT Lv. {profile.leetify.faceit_level}
                  </span>
                )}
                <span className="font-mono text-[9px] text-muted/50">
                  {profile.total_matches} {profile.total_matches === 1 ? 'match' : 'matches'} · {profile.total_rounds} rounds
                </span>
              </div>
            </div>
            {/* Composite score */}
            <div className="shrink-0 text-right">
              <div className="font-display text-3xl tabular-nums leading-none text-text">{scoreDisplay}</div>
              <div className="font-mono text-[9px] text-muted/50 mt-0.5">±{profile.ci} (90% CI)</div>
              <div className="font-mono text-[8px] uppercase tracking-widest text-muted/40 mt-0.5">
                {profile.data_source === 'combined' ? 'BL + Leetify' : profile.data_source === 'leetify' ? 'Leetify' : 'BL'}
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div className="mt-4">
            <div className="w-full bg-surface2 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(profile.score * 100, 100)}%`, background: 'var(--color-accent)' }}
              />
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-5 gap-2 mt-4">
            <StatCard label="K/D" value={profile.kd.toFixed(2)} />
            <StatCard label="KAST" value={pct(profile.kast)} />
            <StatCard label="DPR" value={profile.dpr.toFixed(0)} />
            <StatCard label="OD%" value={pct(profile.od_rate)} />
            <StatCard label="HS%" value={pct(profile.hs)} />
          </div>
        </div>
      </div>

      {/* ── Section 2: Trend ── */}
      <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d1">
        <TrendSection trend={profile.trend} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Section 3: Map performance ── */}
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d1">
          <MapSection records={profile.map_records} />
        </div>

        {/* ── Section 4: Stat detail grid ── */}
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Detailed Stats</span>
          </div>
          <div className="px-4 pb-4 space-y-3">

            {/* Multi-kills */}
            {profile.multi_kills && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-1.5">Multi-kills per kamp</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '3K', val: profile.multi_kills.k3_per_map },
                    { label: '4K', val: profile.multi_kills.k4_per_map },
                    { label: '5K', val: profile.multi_kills.k5_per_map },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-surface2/50 rounded-lg px-2 py-2 text-center">
                      <div className="font-display text-sm tabular-nums text-text">{val.toFixed(2)}</div>
                      <div className="font-mono text-[8px] text-muted/50 mt-0.5">{label}/kamp</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clutch win % */}
            {profile.clutch_win_pct != null && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted/60">Clutch vinn%</span>
                <span className="font-display text-sm tabular-nums text-text">{pct(profile.clutch_win_pct)}</span>
              </div>
            )}

            {/* First death rate */}
            {profile.first_death_rate != null && (
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted/60">First death rate</span>
                <span className="font-display text-sm tabular-nums text-text">{pct(profile.first_death_rate)}</span>
              </div>
            )}

            {/* Side split */}
            {profile.side_split && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted/50 mb-1.5">CT/T opening duel split</div>
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <div className="bg-surface2/50 rounded-lg px-2 py-2 text-center">
                    <div className="font-display text-sm tabular-nums text-text">{pct(profile.side_split.ct_od)}</div>
                    <div className="font-mono text-[8px] text-muted/50 mt-0.5">CT side</div>
                  </div>
                  <div className="bg-surface2/50 rounded-lg px-2 py-2 text-center">
                    <div className="font-display text-sm tabular-nums text-text">{pct(profile.side_split.t_od)}</div>
                    <div className="font-mono text-[8px] text-muted/50 mt-0.5">T side</div>
                  </div>
                </div>
                <p className="font-mono text-[9px] text-muted/60">{profile.side_split.verdict}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Section 5: Radar ── */}
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Role Profile</span>
          </div>
          <div className="flex justify-center pb-4">
            <RadarChart player={playerAnalysis} size={160} />
          </div>
        </div>

        {/* ── Section 6: Leetify ratings (conditional) ── */}
        {profile.leetify && (
          <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d2">
            <div className="px-4 pt-4 pb-2">
              <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Leetify ratings</span>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              {[
                { label: 'Aim', value: profile.leetify.aim, max: 100 },
                { label: 'Posisjonering', value: profile.leetify.positioning, max: 100 },
                { label: 'Utility', value: profile.leetify.utility, max: 100 },
              ].map(({ label, value, max }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted/60">{label}</span>
                    <span className="font-display text-sm tabular-nums text-text">{value.toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-surface2 rounded-full h-1">
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${(value / max) * 100}%`, background: 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              ))}
              {/* Clutch + opening (raw values) */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-surface2/50 rounded px-2 py-1.5 text-center">
                  <div className="font-display text-sm tabular-nums text-text">{profile.leetify.clutch.toFixed(2)}</div>
                  <div className="font-mono text-[8px] text-muted/50">Clutch</div>
                </div>
                <div className="bg-surface2/50 rounded px-2 py-1.5 text-center">
                  <div className="font-display text-sm tabular-nums text-text">{profile.leetify.opening.toFixed(2)}</div>
                  <div className="font-mono text-[8px] text-muted/50">Opening</div>
                </div>
              </div>
              {profile.leetify.reaction_time_ms > 0 && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted/60">Reaksjonstid</span>
                  <span className="font-display text-sm tabular-nums text-text">{profile.leetify.reaction_time_ms} ms</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 7: Recent matchmaking matches (conditional) ── */}
      {profile.recent_matches && profile.recent_matches.length > 0 && (
        <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden fx-rise fx-rise-d3">
          <div className="px-4 pt-4 pb-2">
            <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Siste matchmaking-kamper</span>
            <span className="font-mono text-[9px] text-muted/50 ml-2">(Leetify)</span>
          </div>
          <div className="divide-y divide-border/15">
            {profile.recent_matches.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="font-mono text-[9px] text-muted/50 w-12 shrink-0">{dateShort(m.finished_at)}</div>
                <div className="flex-1 font-mono text-[10px] text-text/80 truncate">{m.map_name}</div>
                <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                  m.outcome === 'win' ? 'text-success border-success/30 bg-success/8'
                  : m.outcome === 'loss' ? 'text-danger border-danger/30 bg-danger/8'
                  : 'text-muted border-border/30'
                }`}>
                  {m.outcome === 'win' ? 'V' : m.outcome === 'loss' ? 'T' : 'U'}
                </span>
                <div className="font-mono text-[10px] tabular-nums text-accent/80 w-10 text-right">
                  {m.leetify_rating.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Back navigation ── */}
      <div className="pt-2 pb-4">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
          ← Back to search
        </Link>
      </div>

    </div>
  )
}
