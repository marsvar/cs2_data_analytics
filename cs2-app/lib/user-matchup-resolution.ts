export async function fetchUserMatchupsWithFallback<T>(
  userId: number,
  fetchByParam: (param: string) => Promise<T[]>,
): Promise<T[]> {
  for (const param of [`user_id=${userId}`, `paradise_user_id=${userId}`]) {
    try {
      const result = await fetchByParam(param)
      if (result.length > 0) return result
    } catch {
      // Try the next query shape before giving up.
    }
  }

  return []
}
