/**
 * Two taps racing past the "already made?" check: the unique client_request_id makes the second
 * insert fail (23505). That request answers with what the first one made instead of an error.
 * Any other unique violation, or no earlier record, is rethrown.
 */
export async function replayOnDuplicate<T>(run: () => Promise<T>, findExisting: () => Promise<T | null | undefined>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      const existing = await findExisting();
      if (existing) return existing;
    }
    throw e;
  }
}
