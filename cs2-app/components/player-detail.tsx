import type { PlayerAnalysis } from '@/lib/types'
import { RadarChart } from './radar-chart'

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

function LeetifyBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-muted w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${value}%`,
            background: 'var(--color-success)',
            opacity: 0.7,
          }}
        />
      </div>
      <span className="text-[9px] font-mono tabular-nums text-muted w-6 text-right">
        {Math.round(value)}
      </span>
    </div>
  )
}

// ── CT/T side split ────────────────────────────────────────────────────────────

function SideSplit({ ct, t }: { ct: number; t: number }) {
  const ctPct = Math.round(ct * 100)
  const tPct = Math.round(t * 100)

  let verdict = 'Allsidig'
  if (ct > 0.55 && t < 0.45) verdict = '← Defensiv spesialist'
  else if (t > 0.55 && ct < 0.45) verdict = '← Aggressiv angriper'
  else if (ct < 0.48 && t < 0.48) verdict = '← Under press begge sider'
  else if (Math.abs(ct - t) > 0.1) verdict = ct > t ? '← Sterkest på CT' : '← Sterkest på T'

  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-2">
        Side-split (Leetify)
      </p>
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
      </div>
      <p className="text-[9px] font-mono text-muted/70 mt-1 italic">{verdict}</p>
    </div>
  )
}

// ── Bayesian weight indicator ──────────────────────────────────────────────────

function DataWeight({ player }: { player: PlayerAnalysis }) {
  if (player.data_source !== 'combined') return null

  const blWeight = Math.min((player.rounds * 1.5) / (player.rounds * 1.5 + 150), 0.75)
  const blPct = Math.round(blWeight * 100)
  const lPct = 100 - blPct

  return (
    <div className="mt-3 pt-3 border-t border-border/30">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-1.5">Datavekting</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full overflow-hidden flex">
          <div className="h-full" style={{ width: `${blPct}%`, background: 'var(--color-accent)' }} />
          <div className="h-full" style={{ width: `${lPct}%`, background: 'var(--color-success)', opacity: 0.5 }} />
        </div>
        <span className="text-[9px] font-mono text-muted whitespace-nowrap">
          BL {blPct}% / Leetify {lPct}%
        </span>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function PlayerDetail({ player }: { player: PlayerAnalysis }) {
  const lowSample = player.rounds < 50

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* Left column: stats */}
      <div>
        {/* Stat grid */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <StatItem label="K/D"    value={player.kd.toFixed(2)} />
          <StatItem label="DPR"    value={player.dpr.toFixed(1)} />
          <StatItem label="KAST"   value={`${Math.round(player.kast * 100)}%`} />
          <StatItem label="HS%"    value={`${Math.round(player.hs * 100)}%`} />
          <StatItem label="OD%"    value={`${Math.round(player.od_rate * 100)}%`} />
          <StatItem label="Runder" value={String(player.rounds)} />
        </div>

        {/* Leetify ratings */}
        {player.leetify && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted mb-2">
              Leetify rating
            </p>
            <LeetifyBar label="Sikte"          value={player.leetify.aim} />
            <LeetifyBar label="Posisjonering"   value={player.leetify.positioning} />
            <LeetifyBar label="Utility"         value={player.leetify.utility} />
          </div>
        )}

        {/* Side split */}
        {player.leetify && (
          <SideSplit ct={player.leetify.ct_od} t={player.leetify.t_od} />
        )}

        {/* Data weight */}
        <DataWeight player={player} />

        {/* Low sample warning */}
        {lowSample && (
          <div className="mt-3 flex items-start gap-1.5 text-[9px] font-mono text-warning">
            <WarnIcon />
            <span>
              Kun {player.rounds} runder — høy usikkerhet (±{player.ci.toFixed(1)})
            </span>
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
