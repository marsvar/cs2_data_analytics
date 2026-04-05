import type { LeetifyRecentMatch, PlayerAnalysis } from '@/lib/types'
import { RadarChart } from './radar-chart'

type MatchStatus = 'upcoming' | 'played'

// ── Warning icon ──────────────────────────────────────────────────────────────

function WarnIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0 mt-px">
      <path d="M5 1L9.33 8.5H0.67L5 1Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" />
      <line x1="5" y1="4" x2="5" y2="6.2" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="5" cy="7.4" r="0.45" fill="currentColor" />
    </svg>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, source }: { label: string; source?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted">{label}</p>
      {source && (
        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-border/40 text-muted/60">
          {source}
        </span>
      )}
    </div>
  )
}

// ── Individual stat item ───────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-0.5">{label}</p>
      <p className="font-mono text-sm tabular-nums text-text">{value}</p>
    </div>
  )
}

// ── Leetify rating bar row ─────────────────────────────────────────────────────

function LeetifyBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-muted w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'var(--color-success)',
            opacity: 0.7,
          }}
        />
      </div>
      <span className="text-[9px] font-mono tabular-nums text-muted w-8 text-right">
        {max === 100 ? Math.round(value) : value.toFixed(1)}
      </span>
    </div>
  )
}

// ── Reaction time stat ─────────────────────────────────────────────────────────

function ReactionTimeLabel(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 200) return 'Elite'
  if (ms < 230) return 'Sterk'
  if (ms < 260) return 'Gjennomsnitt'
  return 'Treg'
}

function ReactionTimeStat({ ms }: { ms: number }) {
  if (ms <= 0) return null
  const label = ReactionTimeLabel(ms)
  const colorClass =
    ms < 200 ? 'text-success' :
    ms < 230 ? 'text-accent' :
    ms < 260 ? 'text-text' :
    'text-warning'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-muted w-28 shrink-0">Reaksjonstid</span>
      <span className={`font-mono text-[10px] tabular-nums ${colorClass}`}>
        {Math.round(ms)} ms
      </span>
      <span className="text-[9px] font-mono text-muted/60">({label})</span>
    </div>
  )
}

function RankPills({
  premier,
  faceitLevel,
  faceitElo,
}: {
  premier?: number
  faceitLevel?: number
  faceitElo?: number
}) {
  if (premier == null && faceitLevel == null && faceitElo == null) return null

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {premier != null && (
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-accent/40 bg-accent/10 text-accent tabular-nums">
          Premier {premier.toLocaleString('nb-NO')}
        </span>
      )}
      {(faceitLevel != null || faceitElo != null) && (
        <span className="text-[10px] font-mono px-2 py-1 rounded border border-success/40 bg-success/10 text-success tabular-nums">
          FACEIT{faceitLevel != null ? ` L${faceitLevel}` : ''}{faceitElo != null ? ` (${faceitElo})` : ''}
        </span>
      )}
    </div>
  )
}

function perRound(value: number | undefined, rounds: number): string {
  if (value == null || rounds <= 0) return '—'
  return (value / rounds).toFixed(2)
}

function perMap(value: number | undefined, rounds: number): string {
  if (value == null || rounds <= 0) return '—'
  const maps = Math.max(rounds / 24, 1)
  return (value / maps).toFixed(2)
}

// ── CT/T side split ────────────────────────────────────────────────────────────

function SideSplit({ ct, t }: { ct: number; t: number }) {
  const ctPct = Math.round(ct * 100)
  const tPct = Math.round(t * 100)

  let verdict = 'Allsidig'
  if (ct > 0.55 && t < 0.45) verdict = 'Defensiv spesialist'
  else if (t > 0.55 && ct < 0.45) verdict = 'Aggressiv angriper'
  else if (ct < 0.48 && t < 0.48) verdict = 'Under press begge sider'
  else if (Math.abs(ct - t) > 0.1) verdict = ct > t ? 'Sterkest på CT' : 'Sterkest på T'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-muted w-4">CT</span>
        <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${ctPct}%`, background: 'var(--color-accent)' }} />
        </div>
        <span className="text-[10px] font-mono tabular-nums text-text w-8 text-right">{ctPct}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-muted w-4">T</span>
        <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${tPct}%`, background: 'var(--color-accent2)' }} />
        </div>
        <span className="text-[10px] font-mono tabular-nums text-text w-8 text-right">{tPct}%</span>
      </div>
      <p className="text-[9px] font-mono text-muted/70 italic">{verdict}</p>
    </div>
  )
}

// ── Bayesian weight indicator ──────────────────────────────────────────────────

function DataWeight({ player }: { player: PlayerAnalysis }) {
  if (player.data_source !== 'combined') return null

  const blWeight = player.bl_weight ?? Math.min((player.rounds * 1.5) / (player.rounds * 1.5 + 150), 0.75)
  const blPct = Math.round(Math.min(Math.max(blWeight, 0), 1) * 100)
  const lPct = 100 - blPct

  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1.5">Datavekting (blandet score)</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full overflow-hidden flex">
          <div className="h-full" style={{ width: `${blPct}%`, background: 'var(--color-accent)' }} />
          <div className="h-full" style={{ width: `${lPct}%`, background: 'var(--color-success)', opacity: 0.5 }} />
        </div>
        <span className="text-[9px] font-mono text-muted whitespace-nowrap">
          BL {blPct}% / Leetify {lPct}%
        </span>
      </div>
      {player.effective_rounds != null && (
        <p className="mt-1 text-[9px] font-mono text-muted/70">
          Effektive runder: {player.effective_rounds.toFixed(1)}
        </p>
      )}
    </div>
  )
}

// ── Recent match history (Leetify matchmaking) ─────────────────────────────────

function RecentMatchTimeline({ matches }: { matches: LeetifyRecentMatch[] }) {
  if (matches.length === 0) return null

  const recent = matches.slice(0, 10)

  // Trend: compare avg rating last 3 vs previous 3
  const last3 = recent.slice(0, 3).map((m) => m.leetify_rating)
  const prev3 = recent.slice(3, 6).map((m) => m.leetify_rating)
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const trendDelta = (avg(last3) != null && avg(prev3) != null)
    ? (avg(last3)! - avg(prev3)!)
    : null

  const trendLabel = trendDelta == null ? null
    : trendDelta > 0.3 ? '▲ Stigende form'
    : trendDelta < -0.3 ? '▼ Synkende form'
    : '→ Stabil form'
  const trendColor = trendDelta == null ? 'text-muted'
    : trendDelta > 0.3 ? 'text-success'
    : trendDelta < -0.3 ? 'text-danger'
    : 'text-muted'

  function mapShort(name: string): string {
    const map = name.replace('de_', '').replace(/_/g, ' ')
    return map.charAt(0).toUpperCase() + map.slice(1)
  }

  function outcomeStyle(outcome: string): string {
    if (outcome === 'win') return 'bg-success/20 text-success border-success/30'
    if (outcome === 'loss') return 'bg-danger/20 text-danger border-danger/30'
    return 'bg-muted/20 text-muted border-border/30'
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('nb-NO', { month: 'short', day: 'numeric' }).format(d)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionHeader label="Leetify form" source="matchmaking" />
        {trendLabel && (
          <span className={`text-[9px] font-mono ${trendColor}`}>{trendLabel}</span>
        )}
      </div>
      <div className="space-y-1">
        {recent.map((match, i) => {
          const ratingWidth = Math.min(Math.max(match.leetify_rating / 10, 0), 1) * 100
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-muted/50 w-12 shrink-0 tabular-nums">
                {formatDate(match.finished_at)}
              </span>
              <span className="text-[9px] font-mono text-muted w-14 shrink-0 truncate">
                {mapShort(match.map_name)}
              </span>
              <span className={`text-[8px] font-mono px-1 py-0.5 rounded border shrink-0 ${outcomeStyle(match.outcome)}`}>
                {match.outcome === 'win' ? 'W' : match.outcome === 'loss' ? 'L' : 'T'}
              </span>
              <div className="flex-1 h-1 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${ratingWidth}%`,
                    background: match.leetify_rating >= 5 ? 'var(--color-success)' : 'var(--color-warning)',
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-[9px] font-mono tabular-nums text-muted/70 w-6 text-right">
                {match.leetify_rating.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function PlayerDetail({
  player,
  matchStatus = 'upcoming',
}: {
  player: PlayerAnalysis
  matchStatus?: MatchStatus
}) {
  const lowSample = matchStatus === 'upcoming' && player.rounds < 50
  const hasLeetify = player.leetify != null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* Left column: stats */}
      <div className="space-y-4">

        {/* BL team performance section */}
        <div>
          <SectionHeader label="Lagprestasjon" source="BL-liga" />
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <StatItem label="K/D"    value={player.kd.toFixed(2)} />
            <StatItem label="DPR"    value={player.dpr.toFixed(1)} />
            <StatItem label="KAST"   value={`${Math.round(player.kast * 100)}%`} />
            <StatItem label="HS%"    value={`${Math.round(player.hs * 100)}%`} />
            <StatItem label="OD%"    value={`${Math.round(player.od_rate * 100)}%`} />
            <StatItem label="Runder" value={String(player.rounds)} />
          </div>

          {/* Low sample warning */}
          {lowSample && (
            <div className="mt-2 flex items-start gap-1.5 text-[9px] font-mono text-warning">
              <WarnIcon />
              <span>
                Kun {player.rounds} runder — høy usikkerhet (±{player.ci.toFixed(1)})
              </span>
            </div>
          )}
        </div>

        {player.bl_extended && (
          <div className="pt-3 border-t border-border/30">
            <SectionHeader label={matchStatus === 'upcoming' ? 'BL-profil' : 'BL-kampsignal'} source="Bedriftsligaen avansert" />
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              <StatItem label="Survival" value={player.bl_extended.survival_ratio != null ? `${Math.round(player.bl_extended.survival_ratio * 100)}%` : '—'} />
              <StatItem label="Trade K/R" value={perRound(player.bl_extended.trade_kills, player.rounds)} />
              <StatItem label="Traded D/R" value={perRound(player.bl_extended.traded_deaths, player.rounds)} />
              <StatItem label="FK/R" value={perRound(player.bl_extended.firstkills, player.rounds)} />
              <StatItem label="Clutch/Map" value={perMap(player.bl_extended.clutches_won, player.rounds)} />
              <StatItem label="1vX/Map" value={perMap(player.bl_extended.one_v_x_total, player.rounds)} />
              <StatItem label="R-rating" value={player.bl_extended.rating != null ? player.bl_extended.rating.toFixed(2) : '—'} />
            </div>
          </div>
        )}

        {/* Leetify individual skill section */}
        {hasLeetify && (
          <div className="pt-3 border-t border-border/30 space-y-1.5">
            <SectionHeader label="Individuelle ferdigheter" source="Leetify matchmaking" />
            <LeetifyBar label="Sikte (percentil)"       value={player.leetify!.aim} />
            <LeetifyBar label="Posisjonering (percentil)" value={player.leetify!.positioning} />
            <LeetifyBar label="Utility (percentil)"     value={player.leetify!.utility} />
            {player.leetify!.clutch > 0 && (
              <LeetifyBar label="Clutch" value={player.leetify!.clutch} max={10} />
            )}
            {player.leetify!.opening > 0 && (
              <LeetifyBar label="Åpning (duell)" value={player.leetify!.opening} max={10} />
            )}
            <ReactionTimeStat ms={player.leetify!.reaction_time_ms} />

            {/* Rank pills */}
            <RankPills
              premier={player.leetify!.premier}
              faceitLevel={player.leetify!.faceit_level}
              faceitElo={player.leetify!.faceit_elo}
            />
          </div>
        )}

        {/* CT/T side split */}
        {hasLeetify && (
          <div className="pt-3 border-t border-border/30">
            <SectionHeader label="CT/T-split" source="Leetify matchmaking" />
            <SideSplit ct={player.leetify!.ct_od} t={player.leetify!.t_od} />
          </div>
        )}

        {/* Data weighting */}
        <DataWeight player={player} />

        {/* Recent match history */}
        {player.recent_matches && player.recent_matches.length > 0 && (
          <div className="pt-3 border-t border-border/30">
            <RecentMatchTimeline matches={player.recent_matches} />
          </div>
        )}
      </div>

      {/* Right column: radar chart */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted self-start sm:self-center">
          Profil
        </p>
        <RadarChart player={player} size={130} />
        <p className="text-[9px] font-mono text-muted/50 text-center leading-relaxed">
          {player.leetify
            ? 'Sikte-akse = Leetify aim-percentil'
            : 'Sikte-akse = HS-rate (ingen Leetify)'}
        </p>
      </div>
    </div>
  )
}
