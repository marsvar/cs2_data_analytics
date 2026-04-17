import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchUserMatchupsWithFallback } from './user-matchup-resolution.ts'

test('fetchUserMatchupsWithFallback retries with paradise_user_id when user_id returns no rows', async () => {
  const calls: string[] = []

  const result = await fetchUserMatchupsWithFallback(4242, async (param) => {
    calls.push(param)

    if (param === 'user_id=4242') return []
    if (param === 'paradise_user_id=4242') {
      return [{ id: 99, finished_at: '2026-04-01T18:00:00Z' }]
    }

    throw new Error(`Unexpected param: ${param}`)
  })

  assert.deepEqual(result, [{ id: 99, finished_at: '2026-04-01T18:00:00Z' }])
  assert.deepEqual(calls, ['user_id=4242', 'paradise_user_id=4242'])
})

test('fetchUserMatchupsWithFallback stops after the first successful query', async () => {
  const calls: string[] = []

  const result = await fetchUserMatchupsWithFallback(99, async (param) => {
    calls.push(param)
    return param === 'user_id=99' ? [{ id: 7 }] : [{ id: 8 }]
  })

  assert.deepEqual(result, [{ id: 7 }])
  assert.deepEqual(calls, ['user_id=99'])
})
