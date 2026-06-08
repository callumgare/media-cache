<template>
  <section class="settings-section">
    <h2 class="section-title">
      <span>Gamepad</span>
      <span class="connection-status">
        <template v-if="connectedGamepads.length === 0">No controllers connected</template>
        <template v-else>
          {{ connectedGamepads.length }} controller{{ connectedGamepads.length > 1 ? 's' : '' }} connected
        </template>
      </span>
    </h2>
    <p class="section-description">
      Select a pre-configured mapping to control the app with a connected gamepad.
      To connect a controller, first pair it with your computer over Bluetooth or plug it in via USB,
      then press any button while this page is in focus.
    </p>
    <div class="mapping-cards">
      <div
        v-for="option in allOptions"
        :key="option?.id ?? 'none'"
        :class="['mapping-card', { selected: !uiState.loading.gamepadMapping && uiState.gamepadMapping === (option?.id ?? null) }]"
        role="radio"
        :aria-checked="uiState.gamepadMapping === (option?.id ?? null)"
        tabindex="0"
        @click="uiState.gamepadMapping = option?.id ?? null"
        @keydown.enter.space.prevent="uiState.gamepadMapping = option?.id ?? null"
      >
        <GamepadDiagram :mapping="option ?? null" class="card-diagram" />
        <span class="card-label">{{ option?.label ?? 'None' }}</span>
      </div>
    </div>
    <p class="selected-description">{{ selectedDescription }}</p>

    <section v-if="uiState.debugMode && !uiState.loading.gamepadMapping" class="settings-section tester-section">
      <h3 class="section-title">Input tester</h3>
      <p class="section-description">
        Press buttons or move sticks on your controller to see which indices they
        report. Use this to verify the selected mapping matches your device.
      </p>
      <div v-if="connectedGamepads.length === 0" class="no-gamepad">
        No gamepad detected — press any button to connect.
      </div>
      <div v-for="gp in connectedGamepads" :key="gp.index" class="gamepad-state">
        <div class="gamepad-id">{{ gp.id }}</div>
        <div class="state-row">
          <span class="state-label">Browser mapping:</span>
          <span class="state-value">{{ gp.browserMapping }}</span>
        </div>
        <div class="state-row">
          <span class="state-label">Buttons pressed:</span>
          <span class="state-value">{{ gp.pressedButtons.length ? gp.pressedButtons.join(', ') : '—' }}</span>
        </div>
        <div class="state-row">
          <span class="state-label">Active axes:</span>
          <span class="state-value">{{ gp.activeAxes || '—' }}</span>
        </div>
        <div class="state-row">
          <span class="state-label">Would dispatch:</span>
          <span class="state-value" :class="{ 'no-match': gp.isInput && !gp.mappedKeys.length }">
            <template v-if="!gp.isInput">—</template>
            <template v-else-if="!gp.browserMapping">No mapping (gamepad use disabled)</template>
            <template v-else-if="!gp.mappedKeys.length">No mapping for these buttons</template>
            <template v-else>{{ gp.mappedKeys.join(', ') }}</template>
          </span>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import { GAMEPAD_MAPPINGS } from "~/lib/gamepad-mappings";

const uiState = useUiState();

const allOptions = computed(() => [...GAMEPAD_MAPPINGS, null]);

const selectedDescription = computed(() => {
  if (!uiState.gamepadMapping) return "Gamepad input is ignored.";
  return (
    GAMEPAD_MAPPINGS.find((m) => m.id === uiState.gamepadMapping)
      ?.description ?? "Gamepad input is ignored."
  );
});

// ─── Live gamepad input tester ────────────────────────────────────────────

interface GamepadSnapshot {
  index: number;
  id: string;
  browserMapping: string;
  pressedButtons: number[];
  activeAxes: string;
  isInput: boolean;
  mappedKeys: string[];
}

const connectedGamepads = ref<GamepadSnapshot[]>([]);
let testerRafId: number | null = null;

function getActiveMapping() {
  if (!uiState.gamepadMapping) return null;
  return GAMEPAD_MAPPINGS.find((m) => m.id === uiState.gamepadMapping) ?? null;
}

function getMappedKeys(pressedButtons: number[], axes: number[]): string[] {
  const mapping = getActiveMapping();
  if (!mapping) return [];
  const keys: string[] = [];

  for (const btnIdx of pressedButtons) {
    const key = mapping.buttonMappings[btnIdx];
    if (key) keys.push(key);
  }

  for (const [axisIdxStr, axisMap] of Object.entries(mapping.axisMappings)) {
    if (!axisMap) continue;
    const value = axes[Number(axisIdxStr)] ?? 0;
    const threshold = axisMap.threshold ?? 0.5;
    if (value < -threshold) keys.push(axisMap.negative);
    else if (value > threshold) keys.push(axisMap.positive);
  }

  return keys;
}

function updateGamepadState() {
  connectedGamepads.value = [...navigator.getGamepads()].flatMap((gp, idx) => {
    if (!gp) return [];
    const pressedButtons = [...gp.buttons]
      .map((b, i) => (b.pressed ? i : null))
      .filter((i): i is number => i !== null);
    const rawAxes = [...gp.axes];
    return [
      {
        index: idx,
        id: gp.id,
        browserMapping: gp.mapping,
        pressedButtons,
        activeAxes: rawAxes
          .map((v, i) => (Math.abs(v) > 0.1 ? `${i}: ${v.toFixed(2)}` : null))
          .filter(Boolean)
          .join(" | "),
        isInput:
          Boolean(pressedButtons.length) ||
          rawAxes.some((v) => Math.abs(v) > 0.1),
        mappedKeys: getMappedKeys(pressedButtons, rawAxes),
      },
    ];
  });
  testerRafId = requestAnimationFrame(updateGamepadState);
}

onMounted(() => updateGamepadState());
onUnmounted(() => {
  if (testerRafId !== null) cancelAnimationFrame(testerRafId);
});
</script>

<style scoped>
.settings-section {
  max-width: 680px;

  .section-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 0.4rem;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .settings-section .section-title {
    font-size: 1rem;
    font-weight: 500;
  }
}


.connection-status {
  font-size: 0.9rem;
  font-weight: 400;
  color: light-dark(var(--p-zinc-500), var(--p-zinc-400));
}

.section-description {
  color: light-dark(var(--p-zinc-500), var(--p-zinc-400));
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

.mapping-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.mapping-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.6rem 0.5rem;
  width: 140px;
  border: 2px solid light-dark(var(--p-zinc-200), var(--p-zinc-700));
  border-radius: 0.5rem;
  cursor: pointer;
  background: light-dark(white, var(--p-zinc-800));
  transition: border-color 0.15s;

  &:hover {
    border-color: light-dark(var(--p-zinc-400), var(--p-zinc-500));
  }

  &.selected {
    border-color: var(--p-primary-color);
  }
}

.card-diagram {
  width: 100%;
}

.card-label {
  font-size: 0.78rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.3;
}

.selected-description {
  font-size: 0.875rem;
  color: light-dark(var(--p-zinc-600), var(--p-zinc-400));
  margin: 0;
  min-height: 2.5em;
}

.tester-section {
  margin-top: 2rem;
}

.no-match {
  color: light-dark(var(--p-orange-500), var(--p-orange-400));
}

.no-gamepad {
  font-size: 0.9rem;
  color: light-dark(var(--p-zinc-500), var(--p-zinc-400));
  font-style: italic;
}

.gamepad-state {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem;
  border: 1px solid light-dark(var(--p-zinc-200), var(--p-zinc-700));
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.gamepad-id {
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.2rem;
}

.state-row {
  display: flex;
  gap: 0.5rem;
}

.state-label {
  color: light-dark(var(--p-zinc-500), var(--p-zinc-400));
  min-width: 120px;
  flex-shrink: 0;
}

.state-value {
  font-family: monospace;
}
</style>
