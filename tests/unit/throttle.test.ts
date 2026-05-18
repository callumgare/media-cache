import { throttleLeadingTrailing } from "@@/server/utils/throttle";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("throttleLeadingTrailing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires 7 times when slammed with calls over 5.5 cooldown periods", () => {
    // Scaled down from 1s to 10ms to keep tests fast.
    // Calls are slammed every ~3ms (multiple per cooldown window).
    // Expected: fires at t=0 (leading), t=10,20,30,40,50 (trailing each window),
    // and t=60 (trailing ~5ms after the last call at t=55).
    const wait = 10;
    const fn = vi.fn();
    const throttled = throttleLeadingTrailing(fn, wait);

    // Window 1 [0, 10): leading fire at t=0, then several calls queue up
    throttled("a"); // t=0 — fires immediately (leading edge)
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");

    vi.advanceTimersByTime(3);
    throttled("b1"); // t=3 — queued, timer armed for 7ms
    vi.advanceTimersByTime(3);
    throttled("b2"); // t=6 — queued, timer already armed
    vi.advanceTimersByTime(3);
    throttled("b3"); // t=9 — queued (latest wins)
    expect(fn).toHaveBeenCalledTimes(1); // no new fire yet
    vi.advanceTimersByTime(1); // t=10 — timer fires
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b3");

    // Window 2 [10, 20)
    vi.advanceTimersByTime(3);
    throttled("c1"); // t=13
    vi.advanceTimersByTime(3);
    throttled("c2"); // t=16
    vi.advanceTimersByTime(3);
    throttled("c3"); // t=19
    vi.advanceTimersByTime(1); // t=20 — timer fires
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith("c3");

    // Window 3 [20, 30)
    vi.advanceTimersByTime(3);
    throttled("d1"); // t=23
    vi.advanceTimersByTime(3);
    throttled("d2"); // t=26
    vi.advanceTimersByTime(3);
    throttled("d3"); // t=29
    vi.advanceTimersByTime(1); // t=30 — timer fires
    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn).toHaveBeenLastCalledWith("d3");

    // Window 4 [30, 40)
    vi.advanceTimersByTime(3);
    throttled("e1"); // t=33
    vi.advanceTimersByTime(3);
    throttled("e2"); // t=36
    vi.advanceTimersByTime(3);
    throttled("e3"); // t=39
    vi.advanceTimersByTime(1); // t=40 — timer fires
    expect(fn).toHaveBeenCalledTimes(5);
    expect(fn).toHaveBeenLastCalledWith("e3");

    // Window 5 [40, 50)
    vi.advanceTimersByTime(3);
    throttled("f1"); // t=43
    vi.advanceTimersByTime(3);
    throttled("f2"); // t=46
    vi.advanceTimersByTime(3);
    throttled("f3"); // t=49
    vi.advanceTimersByTime(1); // t=50 — timer fires
    expect(fn).toHaveBeenCalledTimes(6);
    expect(fn).toHaveBeenLastCalledWith("f3");

    // Window 6 partial [50, 60): last call at t=55 (halfway through), no more after
    vi.advanceTimersByTime(5);
    throttled("g-last"); // t=55 — queued, timer armed for remaining 5ms
    expect(fn).toHaveBeenCalledTimes(6); // not fired yet
    vi.advanceTimersByTime(5); // t=60 — timer fires
    expect(fn).toHaveBeenCalledTimes(7);
    expect(fn).toHaveBeenLastCalledWith("g-last");
  });
});
