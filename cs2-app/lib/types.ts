export type DataSource = 'bl' | 'leetify' | 'combined'

export type LeetifyData = {
  aim: number           // percentile 0–100
  positioning: number   // percentile 0–100
  utility: number       // percentile 0–100
  ct_od: number         // CT-side opening duel win rate 0–1
  t_od: number          // T-side opening duel win rate 0–1
}

export type PlayerAnalysis = {
  name: string
  paradise_user_id: number
  steam64?: string
  score: number         // composite 0–1
  ci: number            // 90% CI half-width
  rounds: number
  kd: number
  kast: number          // 0–1
  dpr: number           // damage per round
  hs: number            // headshot rate 0–1
  od_rate: number       // opening duel win rate 0–1
  leetify?: LeetifyData
  data_source: DataSource
}

export type Team = {
  id: number
  name: string
  players: PlayerAnalysis[]
}

export type AnalyzeResponse = {
  matchup_id: number
  teams: {
    home: Team
    away: Team
  }
  meta: {
    rounds_fetched: number
    leetify_count: number
    data_sources: string[]
    fetched_at: string
    duration_ms: number
  }
}

export type AnalyzeError = {
  error: string
  matchup_id?: number
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
