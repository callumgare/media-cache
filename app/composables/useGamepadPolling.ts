import { useUiState } from "@@/stores/ui";
import {
  GAMEPAD_MAPPINGS,
  type GamepadMappingConfig,
} from "~/lib/gamepad-mappings";

/**
 * Polls the Gamepad API on every animation frame and dispatches synthetic
 * keyboard events based on the active gamepad mapping stored in uiState.
 *
 * Returns { start, stop } – call start() once at app startup.
 */
export function useGamepadPolling() {
  const uiState = useUiState();

  // Composite input id → { key: KeyboardEvent.key, active }
  const prevInputStates = new Map<string, { key: string; active: boolean }>();

  let rafId: number | null = null;

  function getActiveMapping(): GamepadMappingConfig | null {
    if (!uiState.gamepadMapping) return null;
    return (
      GAMEPAD_MAPPINGS.find((m) => m.id === uiState.gamepadMapping) ?? null
    );
  }

  function dispatchKey(key: string, type: "keydown" | "keyup"): void {
    window.dispatchEvent(
      new KeyboardEvent(type, { key, bubbles: true, cancelable: true }),
    );
  }

  function buildNextStates(
    mapping: GamepadMappingConfig,
  ): Map<string, { key: string; active: boolean }> {
    const next = new Map<string, { key: string; active: boolean }>();

    for (const gamepad of navigator.getGamepads()) {
      if (!gamepad) continue;

      for (const [btnIdxStr, key] of Object.entries(mapping.buttonMappings)) {
        if (!key) continue;
        const id = `btn:${btnIdxStr}`;
        const active = gamepad.buttons[Number(btnIdxStr)]?.pressed ?? false;
        next.set(id, {
          key,
          active: (next.get(id)?.active ?? false) || active,
        });
      }

      for (const [axisIdxStr, axisMap] of Object.entries(
        mapping.axisMappings,
      )) {
        if (!axisMap) continue;
        const value = gamepad.axes[Number(axisIdxStr)] ?? 0;
        const threshold = axisMap.threshold ?? 0.5;

        const negId = `axis:${axisIdxStr}:neg`;
        next.set(negId, {
          key: axisMap.negative,
          active: (next.get(negId)?.active ?? false) || value < -threshold,
        });

        const posId = `axis:${axisIdxStr}:pos`;
        next.set(posId, {
          key: axisMap.positive,
          active: (next.get(posId)?.active ?? false) || value > threshold,
        });
      }
    }

    return next;
  }

  function poll(): void {
    const mapping = getActiveMapping();
    const nextStates = mapping
      ? buildNextStates(mapping)
      : new Map<string, { key: string; active: boolean }>();

    // Dispatch keyup for inputs that were active but are now inactive or unmapped
    for (const [id, prev] of prevInputStates) {
      if (prev.active && !nextStates.get(id)?.active) {
        dispatchKey(prev.key, "keyup");
      }
    }

    // Dispatch keydown for newly active inputs
    for (const [id, next] of nextStates) {
      if (next.active && !prevInputStates.get(id)?.active) {
        dispatchKey(next.key, "keydown");
      }
    }

    prevInputStates.clear();
    for (const [id, state] of nextStates) {
      prevInputStates.set(id, state);
    }

    rafId = requestAnimationFrame(poll);
  }

  function start(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(poll);
  }

  function stop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // Release any held keys
    for (const [, state] of prevInputStates) {
      if (state.active) dispatchKey(state.key, "keyup");
    }
    prevInputStates.clear();
  }

  return { start, stop };
}
