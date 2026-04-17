export type LineupRosterEntry = {
  userId: number
  userName?: string
  steam64?: string
  avatarUrl?: string
}

export function resolveLineupMembers<T extends LineupRosterEntry>({
  lineupIds,
  rosterByUserId,
  teamRoster,
}: {
  lineupIds: number[]
  rosterByUserId: Map<number, T>
  teamRoster: T[]
}): T[] {
  if (lineupIds.length > 0) {
    const resolved: T[] = []
    const seen = new Set<number>()

    for (const userId of lineupIds) {
      if (userId <= 0 || seen.has(userId)) continue
      seen.add(userId)

      const rosterEntry = rosterByUserId.get(userId)
      if (rosterEntry) {
        resolved.push(rosterEntry)
        continue
      }

      resolved.push({ userId } as T)
    }

    if (resolved.length > 0) return resolved
  }

  return teamRoster
}
