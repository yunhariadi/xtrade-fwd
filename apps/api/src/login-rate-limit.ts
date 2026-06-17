/**
 * Minimal in-memory brute-force throttle for the login route. Single-process,
 * single-user scope — no external store. Keyed by client IP: after
 * MAX_ATTEMPTS failures within WINDOW_MS, that IP is blocked for BLOCK_MS. A
 * successful login clears the counter.
 */

const WINDOW_MS = 15 * 60 * 1000; // failures counted within this window
const MAX_ATTEMPTS = 5; // failures before a block kicks in
const BLOCK_MS = 15 * 60 * 1000; // block duration once tripped

interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil?: number;
}

const attempts = new Map<string, Attempt>();

/** Drop entries whose window has lapsed and whose block (if any) has expired. */
function prune(now: number): void {
  for (const [key, a] of attempts) {
    const blockOver = !a.blockedUntil || a.blockedUntil <= now;
    if (blockOver && now - a.firstAt > WINDOW_MS) attempts.delete(key);
  }
}

/** Is this key currently allowed to attempt a login? */
export function checkLoginRate(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const a = attempts.get(key);
  if (a?.blockedUntil && a.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((a.blockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

/** Record a failed login; trips a block once MAX_ATTEMPTS is reached. */
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  if (attempts.size > 1000) prune(now);

  let a = attempts.get(key);
  if (!a || now - a.firstAt > WINDOW_MS) a = { count: 0, firstAt: now };

  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) a.blockedUntil = now + BLOCK_MS;
  attempts.set(key, a);
}

/** Clear the counter for a key after a successful login. */
export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}
