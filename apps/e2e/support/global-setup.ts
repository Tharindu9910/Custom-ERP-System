import { API } from './env';

/** The webServer entries reset the DB and start the servers; wait until the API answers logins. */
export default async function globalSetup(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API at ${API} did not come up`);
}
