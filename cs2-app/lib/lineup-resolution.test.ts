import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveLineupMembers } from './lineup-resolution.ts'

test('resolveLineupMembers prefers explicit lineup ids over the full team roster', () => {
  const teamRoster = [
    { userId: 1, userName: 'Alpha', steam64: 'steam-1', avatarUrl: 'a.png' },
    { userId: 2, userName: 'Bravo', steam64: 'steam-2', avatarUrl: 'b.png' },
    { userId: 3, userName: 'Former Player', steam64: 'steam-3', avatarUrl: 'c.png' },
  ]

  const result = resolveLineupMembers({
    lineupIds: [2, 1, 2],
    rosterByUserId: new Map(teamRoster.map((player) => [player.userId, player])),
    teamRoster,
  })

  assert.deepEqual(result, [
    { userId: 2, userName: 'Bravo', steam64: 'steam-2', avatarUrl: 'b.png' },
    { userId: 1, userName: 'Alpha', steam64: 'steam-1', avatarUrl: 'a.png' },
  ])
})

test('resolveLineupMembers falls back to the team roster when matchup lineup ids are unavailable', () => {
  const teamRoster = [
    { userId: 10, userName: 'Anchor', steam64: 'steam-10', avatarUrl: 'a.png' },
    { userId: 11, userName: 'Support', steam64: 'steam-11', avatarUrl: 'b.png' },
  ]

  const result = resolveLineupMembers({
    lineupIds: [],
    rosterByUserId: new Map(teamRoster.map((player) => [player.userId, player])),
    teamRoster,
  })

  assert.deepEqual(result, teamRoster)
})
