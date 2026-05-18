/**
 * Returns a throttled version of `fn` that:
 * - fires immediately on the first call (leading edge)
 * - during the cooldown, queues the latest call, discarding earlier ones
 * - fires the latest queued call once the cooldown expires (trailing edge)
 *
 * @param fn   - Function to throttle
 * @param wait - Cooldown period in milliseconds
 */
export function throttleLeadingTrailing<T extends unknown[]>(
  fn: (...args: T) => void,
  wait: number,
): (...args: T) => void {
  let lastFiredAt = Number.NEGATIVE_INFINITY;
  let pendingArgs: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: T): void => {
    const now = Date.now();
    const elapsed = now - lastFiredAt;

    if (elapsed >= wait) {
      // Outside the cooldown — fire immediately
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        pendingArgs = null;
      }
      lastFiredAt = now;
      fn(...args);
    } else {
      // Inside the cooldown — keep only the latest args and arm the timer once
      pendingArgs = args;
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          const pending = pendingArgs;
          if (!pending) {
            return;
          }
          pendingArgs = null;
          lastFiredAt = Date.now();
          fn(...pending);
        }, wait - elapsed);
      }
    }
  };
}
