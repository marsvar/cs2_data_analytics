import type { PlayerAnalysis, PlayerRole } from './types'

export type Role = 'ENTRY' | 'AWP' | 'SUPP' | 'FRAG' | 'ANCH'

export function detectRole(p: PlayerAnalysis): Role | null {
  const firstkillRate = p.rounds > 0 ? (p.bl_extended?.firstkills ?? 0) / p.rounds : 0
  const tradedDeathsPerRound = p.rounds > 0 ? (p.bl_extended?.traded_deaths ?? 0) / p.rounds : 0
  const tradeKillsPerRound = p.rounds > 0 ? (p.bl_extended?.trade_kills ?? 0) / p.rounds : 0
  const survival = p.bl_extended?.survival_ratio ?? null

  // Entry fragger: commits to opening duels, doesn't always survive
  if ((p.od_rate > 0.52 || firstkillRate > 0.09) && (p.kast < 0.72 || tradedDeathsPerRound > 0.08)) return 'ENTRY'
  // AWPer: high headshot rate + high damage (one-shot kills skew HS up)
  if (p.hs > 0.55 && p.dpr > 80) return 'AWP'
  // Support: high KAST (assists, survives) but not top fragger
  if ((p.kast > 0.75 || (survival != null && survival > 0.36)) && tradeKillsPerRound > 0.08 && p.kd < 1.15) return 'SUPP'
  // Fragger: consistent kills without being the entry
  if (p.kd > 1.2 && p.kast > 0.65 && p.od_rate < 0.52) return 'FRAG'
  // Anchor: CT specialist — only detectable with Leetify side-split data
  if (p.leetify && p.leetify.ct_od > 0.55 && p.leetify.t_od < 0.45 && (survival == null || survival > 0.34)) return 'ANCH'
  return null
}

export const ROLE_META: Record<
  Role,
  { label: string; desc: string; colorClass: string }
> = {
  ENTRY: { label: 'ENTRY', desc: 'Åpner runder, høy OD-rate', colorClass: 'text-accent2' },
  AWP:   { label: 'AWP',   desc: 'Høy presisjon, stor DPR',    colorClass: 'text-success' },
  SUPP:  { label: 'SUPP',  desc: 'Høy KAST, teamspiller',       colorClass: 'text-accent' },
  FRAG:  { label: 'FRAG',  desc: 'Konsistent draper',           colorClass: 'text-warning' },
  ANCH:  { label: 'ANCH',  desc: 'CT-spesialist',               colorClass: 'text-muted' },
}

// ── Profile role inference (6-role system for player/team profile pages) ──────

export const ROLE_META_PROFILE: Record<
  PlayerRole,
  { label: string; desc: string; colorClass: string }
> = {
  entry:   { label: 'ENTRY',   desc: 'Åpner runder, høy OD-rate',     colorClass: 'text-accent2' },
  support: { label: 'SUPPORT', desc: 'Høy KAST, utility-fokus',        colorClass: 'text-accent' },
  lurker:  { label: 'LURKER',  desc: 'Trade-kills, passiv posisjon',   colorClass: 'text-muted' },
  awper:   { label: 'AWPER',   desc: 'Høy HS%, ett-skudd-kills',       colorClass: 'text-success' },
  igl:     { label: 'IGL',     desc: 'Taktisk profil, lav OD',         colorClass: 'text-warning' },
  hybrid:  { label: 'HYBRID',  desc: 'Allsidig, ingen klar rolle',     colorClass: 'text-text' },
}

/**
 * Infer a player role from their aggregated season stats.
 * Returns role, confidence level, and the two strongest signals.
 * Does NOT modify the existing detectRole() function.
 */
export function inferProfileRole(
  p: PlayerAnalysis,
  matchCount: number,
): { role: PlayerRole; confidence: 'low' | 'medium' | 'high'; signals: string[] } {
  const confidence: 'low' | 'medium' | 'high' =
    matchCount < 5 ? 'low' : matchCount < 15 ? 'medium' : 'high'

  const firstkillRate = p.rounds > 0 ? (p.bl_extended?.firstkills ?? 0) / p.rounds : 0
  const tradeKillsPerRound = p.rounds > 0 ? (p.bl_extended?.trade_kills ?? 0) / p.rounds : 0
  const assistsPerRound = p.rounds > 0 ? p.assists / p.rounds : 0

  // Entry: aggressive opener
  if (p.od_rate > 0.52 || firstkillRate > 0.09) {
    const signals: string[] = []
    if (p.od_rate > 0.52) signals.push(`Høy OD-rate (${(p.od_rate * 100).toFixed(0)}%)`)
    if (firstkillRate > 0.09) signals.push(`Høy first-kill rate (${(firstkillRate * 100).toFixed(1)}%)`)
    if (p.kast < 0.72) signals.push(`Lav KAST (${(p.kast * 100).toFixed(0)}%)`)
    return { role: 'entry', confidence, signals: signals.slice(0, 2) }
  }

  // AWPer: high HS% + high DPR
  if (p.hs > 0.55 && p.dpr > 80) {
    return {
      role: 'awper',
      confidence,
      signals: [
        `Høy headshot-rate (${(p.hs * 100).toFixed(0)}%)`,
        `Høy DPR (${p.dpr.toFixed(0)})`,
      ],
    }
  }

  // Support: high KAST + many assists
  if (p.kast > 0.75 && assistsPerRound > 0.35) {
    return {
      role: 'support',
      confidence,
      signals: [
        `Høy KAST (${(p.kast * 100).toFixed(0)}%)`,
        `Mange assists per runde (${assistsPerRound.toFixed(2)})`,
      ],
    }
  }

  // Lurker: high trade kills, asymmetric OD
  if (tradeKillsPerRound > 0.12) {
    const signals: string[] = [`Høy trade-kill rate (${(tradeKillsPerRound * 100).toFixed(1)}%)`]
    if (p.leetify && Math.abs(p.leetify.ct_od - p.leetify.t_od) > 0.15) {
      signals.push(`Asymmetrisk CT/T-OD split`)
    } else {
      signals.push(`Passiv posisjonering`)
    }
    return { role: 'lurker', confidence, signals }
  }

  // IGL: passive profile — low OD, decent KAST, below-average KD
  if (p.od_rate < 0.40 && p.kast > 0.72 && p.kd < 1.0) {
    return {
      role: 'igl',
      confidence,
      signals: [
        `Lav OD-rate (${(p.od_rate * 100).toFixed(0)}%)`,
        `Høy KAST (${(p.kast * 100).toFixed(0)}%) til tross for lav K/D`,
      ],
    }
  }

  return { role: 'hybrid', confidence, signals: ['Ingen dominerende profil identifisert'] }
}
