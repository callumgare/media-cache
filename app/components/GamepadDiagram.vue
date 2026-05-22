<template>
  <svg
    viewBox="0 0 180 108"
    xmlns="http://www.w3.org/2000/svg"
    class="diagram"
    aria-hidden="true"
  >
    <!-- Shoulder buttons -->
    <rect class="body" x="24" y="6" width="44" height="13" rx="7" />
    <rect class="body" x="112" y="6" width="44" height="13" rx="7" />

    <!-- Left grip, right grip, main body (rendered back-to-front) -->
    <rect class="body" x="12" y="52" width="52" height="48" rx="16" />
    <rect class="body" x="116" y="52" width="52" height="48" rx="16" />
    <rect class="body" x="18" y="16" width="144" height="56" rx="22" />

    <!-- D-pad (center square + 4 directional arms) -->
    <rect :class="['ctrl', { active: isButtonActive(12) }]" x="40" y="28" width="9" height="13" rx="2" />
    <rect :class="['ctrl', { active: isButtonActive(13) }]" x="40" y="50" width="9" height="13" rx="2" />
    <rect :class="['ctrl', { active: isButtonActive(14) }]" x="27" y="41" width="13" height="9" rx="2" />
    <rect :class="['ctrl', { active: isButtonActive(15) }]" x="49" y="41" width="13" height="9" rx="2" />
    <!-- D-pad center (always body color, fills cross gap) -->
    <rect class="body" x="40" y="41" width="9" height="9" />

    <!-- Left stick -->
    <g :class="['stick', { active: leftStickActive }]">
      <circle class="stick-ring" cx="65" cy="68" r="11" />
      <circle class="stick-nub" cx="65" cy="68" r="4" />
    </g>

    <!-- Right stick -->
    <g :class="['stick', { active: rightStickActive }]">
      <circle class="stick-ring" cx="115" cy="68" r="11" />
      <circle class="stick-nub" cx="115" cy="68" r="4" />
    </g>

    <!-- Face buttons (A/B/X/Y) — decorative -->
    <circle class="ctrl" cx="134" cy="32" r="4.5" />
    <circle class="ctrl" cx="144" cy="42" r="4.5" />
    <circle class="ctrl" cx="134" cy="52" r="4.5" />
    <circle class="ctrl" cx="124" cy="42" r="4.5" />

    <!-- Center cluster (select / home / start) — decorative -->
    <circle class="ctrl" cx="84" cy="43" r="3.5" />
    <circle class="ctrl" cx="90" cy="37" r="5" />
    <circle class="ctrl" cx="96" cy="43" r="3.5" />

    <!-- Disabled slash overlay -->
    <line v-if="mapping === null" class="slash" x1="18" y1="8" x2="162" y2="100" />
  </svg>
</template>

<script setup lang="ts">
import type { GamepadMappingConfig } from "~/lib/gamepad-mappings";

const props = defineProps<{
  mapping: GamepadMappingConfig | null;
}>();

function isButtonActive(index: number): boolean {
  return props.mapping !== null && index in props.mapping.buttonMappings;
}

const leftStickActive = computed(
  () =>
    props.mapping !== null &&
    (0 in props.mapping.axisMappings || 1 in props.mapping.axisMappings),
);

const rightStickActive = computed(
  () =>
    props.mapping !== null &&
    (2 in props.mapping.axisMappings || 3 in props.mapping.axisMappings),
);
</script>

<style scoped>
.diagram {
  width: 100%;
  height: auto;
  display: block;
}

.body {
  fill: light-dark(#d4d4d8, #52525b);
}

.ctrl {
  fill: light-dark(#a1a1aa, #71717a);
}

.ctrl.active {
  fill: var(--p-primary-color);
}

.stick-ring {
  fill: light-dark(#a1a1aa, #71717a);
}

.stick.active .stick-ring {
  fill: var(--p-primary-color);
}

.stick-nub {
  fill: light-dark(#d4d4d8, #52525b);
}

.stick.active .stick-nub {
  fill: light-dark(#fff, #e4e4e7);
}

.slash {
  stroke: light-dark(#71717a, #a1a1aa);
  stroke-width: 6;
  stroke-linecap: round;
}
</style>
