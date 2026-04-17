import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveFirstDeathRate,
  resolveProfileSteam64,
} from './player-profile-support.ts'

test('resolveProfileSteam64 falls back to the static player map when BL user lookup has no steam id', () => {
  assert.equal(resolveProfileSteam64(undefined, '76561198258030105'), '76561198258030105')
})

test('resolveProfileSteam64 prefers the BL user steam id when available', () => {
  assert.equal(resolveProfileSteam64('custom-steam-id', '76561198258030105'), 'custom-steam-id')
})

test('deriveFirstDeathRate computes the rate from opening losses and total rounds', () => {
  assert.equal(deriveFirstDeathRate(18, 120), 0.15)
})

test('deriveFirstDeathRate returns null when rounds are missing', () => {
  assert.equal(deriveFirstDeathRate(4, 0), null)
})
