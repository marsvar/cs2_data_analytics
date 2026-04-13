export type DataSource = 'bl' | 'leetify' | 'combined'

export type LeetifyData = {
  aim: number           // percentile 0–100
  positioning: number   // percentile 0–100
  utility: number       // percentile 0–100
  clutch: number        // raw clutch rating (typically 0–10, not a percentile)
  opening: number       // raw opening rating (typically 0–10, not a percentile)
  ct_od: number         // CT-side opening duel win rate 0–1 (matchmaking context)
  t_od: number          // T-side opening duel win rate 0–1 (matchmaking context)
  reaction_time_ms: number // average reaction time in ms (matchmaking context)
  premier?: number      // Premier rating (if available)
  faceit_level?: number // FACEIT level (if available)
  faceit_elo?: number   // FACEIT ELO (if available)
}

export type LeetifyRecentMatch = {
  finished_at: string
  map_name: string
  outcome: 'win' | 'loss' | 'tie'
  leetify_rating: number
}

export type LeetifyProfileWithRecent = {
  summary: LeetifyData
  recent_matches: LeetifyRecentMatch[]
}

export type BLAdvancedStats = {
  survival_ratio?: number
  trade_kills?: number
  traded_deaths?: number
  firstkills?: number
  clutches_won?: number
  won_1v1?: number
  won_1v2?: number
  won_1v3?: number
  won_1v4?: number
  won_1v5?: number
  one_v_x_total?: number
  rating?: number
  damage_diff?: number
  explosive_rounds_total?: number
  multi_kills?: {
    rounds_with_2k?: number
    rounds_with_3k?: number
    rounds_with_4k?: number
    rounds_with_5k?: number
  }
}

export type PlayerAnalysis = {
  name: string
  paradise_user_id: number
  steam64?: string
  avatar_url?: string
  score: number         // composite 0–1
  leetify_prior?: number // prior composite proxy 0–1 (if Leetify exists)
  bl_weight?: number    // BL contribution weight used in final score (0–1)
  effective_rounds?: number // recency-weighted rounds used for Bayesian blend
  bl_rating?: number    // BL R-rating (raw value)
  bl_rating_baseline?: number // historical BL R-rating baseline
  ci: number            // 90% CI half-width
  rounds: number
  assists: number
  kd: number
  kast: number          // 0–1
  dpr: number           // damage per round
  hs: number            // headshot rate 0–1
  od_rate: number       // opening duel win rate 0–1
  bl_extended?: BLAdvancedStats
  leetify?: LeetifyData
  recent_matches?: LeetifyRecentMatch[] // from Leetify matchmaking history
  data_source: DataSource
}

export type Team = {
  id: number
  name: string
  logo_url?: string
  players: PlayerAnalysis[]
}

export type LandingAnalytics = {
  tactical_edge: {
    favored: 'home' | 'away' | 'even'
    home_win_pct: number
    away_win_pct: number
    confidence_note: string
  }
  reliability: {
    avg_rounds: number
    low_sample: boolean
    high_uncertainty: boolean
    player_count: number
  }
  early_round_edge: {
    home_od: number
    away_od: number
    delta: number
    source: 'bl' | 'leetify' | 'combined'
    ct_split?: { home: number; away: number; delta: number }
    t_split?: { home: number; away: number; delta: number }
  }
  trade_structure_edge?: {
    home_trade_kill_rate: number
    away_trade_kill_rate: number
    trade_kill_delta: number
    home_trade_recovery_rate?: number
    away_trade_recovery_rate?: number
    trade_recovery_delta?: number
    source: 'bl' | 'insufficient'
  }
  survival_discipline_edge?: {
    home_survival: number
    away_survival: number
    survival_delta: number
    home_kast: number
    away_kast: number
    source: 'bl' | 'insufficient'
  }
  entry_pressure_edge?: {
    home_firstkill_rate: number
    away_firstkill_rate: number
    firstkill_delta: number
    home_od: number
    away_od: number
    source: 'bl' | 'combined' | 'insufficient'
  }
  form_vs_prior: {
    home_delta: number
    away_delta: number
    home_samples: number
    away_samples: number
  }
  map_pool?: {
    recent_days: number
    min_matches_per_player: number
    home: {
      maps: MapInsight[]
      included_players: number
      excluded_players: number
    }
    away: {
      maps: MapInsight[]
      included_players: number
      excluded_players: number
    }
    veto_hint?: {
      suggested_ban1_for_home?: string
      suggested_ban1_for_away?: string
      suggested_pick_for_home?: string
      suggested_pick_for_away?: string
      suggested_ban2_for_home?: string
      suggested_ban2_for_away?: string
      decider_map?: string
      // Deprecated aliases kept for backwards compatibility in UI consumers.
      avoid_for_home?: string
      avoid_for_away?: string
    }
  }
  matchup_axes?: Array<{
    key: 'opening_duel' | 'trade_structure' | 'survival_discipline' | 'entry_pressure' | 'map_leverage'
    label: string
    home_value: number
    away_value: number
    home_display: string
    away_display: string
    confidence: 'low' | 'medium' | 'high'
    source: 'bl' | 'leetify' | 'combined' | 'derived' | 'insufficient'
    note?: string
  }>
  map_battlefield?: {
    maps: Array<{
      map: string
      home_win_rate?: number
      away_win_rate?: number
      home_sample_size: number
      away_sample_size: number
      favored: 'home' | 'away' | 'even'
      confidence: 'low' | 'medium' | 'high'
      home_display: string
      away_display: string
    }>
    strongest_for_home: string[]
    weakest_for_home: string[]
    strongest_for_away: string[]
    weakest_for_away: string[]
    veto_flow: Array<{
      step: 'ban' | 'pick' | 'decider'
      team: 'home' | 'away' | 'neutral'
      label: string
      map: string
    }>
  }
  watchlist?: {
    home: {
      initiators: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
      form_players: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
      risk_players: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
    }
    away: {
      initiators: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
      form_players: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
      risk_players: Array<{
        paradise_user_id: number
        name: string
        avatar_url?: string
        reason: string
        display_value: string
      }>
    }
  }
  lineup_delta?: {
    home_win_pct_delta: number
    away_win_pct_delta: number
    opening_edge_delta: number
    map_leverage_delta: number
    changed: boolean
  }
  game_plan?: string[]
}

export type MapInsight = {
  map: string
  wins: number
  losses: number
  win_rate: number       // 0–1
  avg_leetify_rating: number
  sample_size: number
  confidence: 'low' | 'medium' | 'high'
}

export type PlayerMapStat = {
  map: string
  wins: number
  total: number
  rating_sum: number
}

export type PlayerMapContribution = {
  paradise_user_id: number
  name: string
  avatar_url?: string
  included: boolean
  matches_considered: number
  maps: PlayerMapStat[]
}

export type AnalyzeResponse = {
  matchup_id: number
  teams: {
    home: Team
    away: Team
  }
  result_summary?: {
    home_score?: number | null
    away_score?: number | null
    winner: 'home' | 'away' | 'draw' | 'unknown'
    finished_at?: string | null
  }
  maps_played?: {
    total_maps: number
    maps: Array<{
      name?: string
      image_url?: string
      home_score?: number | null
      away_score?: number | null
      winner?: 'home' | 'away' | 'draw' | 'unknown'
      source: 'api' | 'derived'
    }>
    completeness: 'full' | 'partial' | 'missing'
    note?: string
  }
  post_analysis?: {
    tactical_control: {
      summary: string
      opening_duel_edge_pp: number
      pressure_edge_dpr: number
      stability_edge_kast_pp: number
      role_impact: Array<{
        team: 'home' | 'away'
        player_name: string
        role: string
        impact_note: string
      }>
    }
    economy_proxies: {
      summary: string
      indicators: {
        opening_control_pp: number
        survival_edge_kast_pp: number
        damage_pressure_edge_dpr: number
        trade_structure_pp?: number
        survival_edge_pp?: number
      }
      signal_wins?: {
        home: number
        away: number
        signals: Array<{
          label: string
          winner: 'home' | 'away' | 'even'
          edge: number
        }>
      }
      caveat: string
    }
    teamplay_control?: {
      summary: string
      indicators: {
        trade_kill_edge_per_100_rounds: number
        trade_recovery_edge_pp?: number
        assist_edge_per_round: number
      }
      caveat: string
    }
    round_stability?: {
      summary: string
      indicators: {
        survival_edge_pp?: number
        kast_edge_pp: number
        survival_minus_kast_edge_pp?: number
      }
      caveat: string
    }
    late_round_conversion?: {
      summary: string
      metrics: {
        clutch_wins_per_map?: {
          home: number
          away: number
          edge: number
        }
        one_v_x_wins_per_map?: {
          home: number
          away: number
          edge: number
        }
        explosive_rounds_per_map?: {
          home: number
          away: number
          edge: number
        }
      }
      caveat: string
    }
    player_development: {
      focus_players: Array<{
        team: 'home' | 'away'
        player_name: string
        trend: 'overperforming' | 'underperforming' | 'stable'
        metric: 'bl_rating' | 'score'
        note: string
        action: string
        current_value?: number
        baseline_value?: number
        delta_value?: number
        score?: number        // composite 0–1, present in in-match fallback
        score_max?: number    // max score in the match (for progress bar scaling)
        is_relative?: boolean // true = in-match relative fallback (no Leetify baseline)
      }>
    }
    coach_recommendations: string[]
  }
  landing?: LandingAnalytics
  simulation?: {
    lineup_size: number
    active_maps: string[]
    map_pool: {
      recent_days: number
      min_matches_per_player: number
      home_player_maps: PlayerMapContribution[]
      away_player_maps: PlayerMapContribution[]
    }
  }
  meta: {
    match_status: 'upcoming' | 'played'
    rounds_fetched: number
    leetify_count: number
    leetify_attempts: number
    data_sources: string[]
    match_start_time?: string | null
    match_finished_time?: string | null
    fetched_at: string
    duration_ms: number
  }
}

export type AnalyzeError = {
  error: string
  matchup_id?: number
}

export type DivisionMatchSummary = {
  matchup_id: number
  round_number?: number
  home_team: string
  away_team: string
  home_team_id?: number
  away_team_id?: number
  home_logo_url?: string
  away_logo_url?: string
  date: string | null
  status: 'upcoming' | 'completed' | 'live' | 'unknown'
  phase: 'not_played_yet' | 'played'
  home_score?: number | null   // rounds/maps won by home (if available from API)
  away_score?: number | null   // rounds/maps won by away (if available from API)
}

export type DivisionResponse = {
  division_id: number
  division_name?: string
  matches: DivisionMatchSummary[]
  fetched_at: string
}

export type MatchSearchHit = DivisionMatchSummary & {
  label: string
}

export type MatchSearchResponse = {
  query: string
  division_id: number
  division_name: string
  matches: MatchSearchHit[]
  fetched_at: string
}

// ── Player Profile ────────────────────────────────────────────────────────────

export type PlayerRole = 'entry' | 'support' | 'lurker' | 'awper' | 'igl' | 'hybrid'

export type PerformanceTrendPoint = {
  matchup_id: number
  date: string | null
  score: number
  kd: number
  dpr: number
  map?: string
  won: boolean | null
}

export type PlayerMapRecord = {
  map: string
  played: number
  wins: number
  losses: number
  win_rate: number
  avg_kd: number
  avg_dpr: number
  avg_kast: number
  confidence: 'low' | 'medium' | 'high'
}

export type PlayerProfileResponse = {
  paradise_user_id: number
  name: string
  avatar_url?: string
  steam64?: string
  total_rounds: number
  total_matches: number
  kd: number
  kast: number
  dpr: number
  hs: number
  od_rate: number
  flash_assists_per_round: number | null
  utility_dmg_per_round: number | null
  clutch_win_pct: number | null
  first_death_rate: number | null
  multi_kills: {
    k3: number
    k4: number
    k5: number
    k3_per_map: number
    k4_per_map: number
    k5_per_map: number
  } | null
  side_split: { ct_od: number; t_od: number; verdict: string } | null
  score: number
  ci: number
  role: PlayerRole
  role_confidence: 'low' | 'medium' | 'high'
  role_signals: string[]
  trend: {
    last5: PerformanceTrendPoint[]
    last10: PerformanceTrendPoint[]
    last20: PerformanceTrendPoint[]
  }
  map_records: PlayerMapRecord[]
  leetify?: LeetifyData
  recent_matches?: LeetifyRecentMatch[]
  data_source: DataSource
  fetched_at: string
}

export type RosterMember = {
  paradise_user_id: number
  name: string
  avatar_url?: string
  steam64?: string
  role: PlayerRole | null
  score: number | null
  rounds: number
}

export type TeamMapPoolEntry = {
  map: string
  played: number
  wins: number
  losses: number
  win_rate: number
  ct_rounds: number | null
  t_rounds: number | null
  confidence: 'low' | 'medium' | 'high'
}

export type TeamMatchResult = {
  matchup_id: number
  date: string | null
  opponent_name: string
  opponent_id: number
  home_or_away: 'home' | 'away'
  won: boolean | null
  home_score: number | null
  away_score: number | null
  map?: string
}

export type TeamProfileResponse = {
  team_id: number
  team_name: string
  logo_url?: string
  total_matches: number
  wins: number
  losses: number
  win_rate: number
  map_pool: TeamMapPoolEntry[]
  roster: RosterMember[]
  role_distribution: Partial<Record<PlayerRole, number>>
  composition_notes: string[]
  playstyle_summary: string
  match_history: TeamMatchResult[]
  economy_notes: string[]
  veto_patterns: null
  fetched_at: string
}

// BL API raw types
export type BLPlayerStats = {
  paradise_user_id: number
  name: string
  kills: number
  deaths: number
  assists: number
  damage: number
  rounds: number
  hs: number
  kast: number
  opening_kills: number
  opening_attempts: number
  bl_extended?: BLAdvancedStats
  maps_played?: number
}

export type BLMatchupStats = {
  matchup_id: number
  home_team: { id: number; name: string }
  away_team: { id: number; name: string }
  home_players: BLPlayerStats[]
  away_players: BLPlayerStats[]
  total_rounds: number
}

// Leetify API raw types
export type LeetifyProfile = {
  rating: {
    aim: number
    positioning: number
    utility: number
    clutch: number
    opening: number
  }
  stats: {
    ct_opening_duel_success_percentage: number
    t_opening_duel_success_percentage: number
    reaction_time_ms: number
  }
}
