/**
 * Temporary UI-only editor gate for the entire settings window.
 * Never treat it as authentication: shipped client code is public.
 * A future backend identity provider must replace this before shared writes.
 */
export function mayUnlockSettings(username: string, password: string): boolean {
  return username === "" && password === "";
}
