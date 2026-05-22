export interface GamepadMappingConfig {
  id: string;
  label: string;
  description: string;
  /** Maps standard gamepad button index → KeyboardEvent.key */
  buttonMappings: Partial<Record<number, string>>;
  /** Maps axis index → { negative key, positive key, threshold (default 0.5) } */
  axisMappings: Partial<
    Record<number, { negative: string; positive: string; threshold?: number }>
  >;
}

/**
 * Pre-configured gamepad mappings.
 *
 * Standard gamepad button indices (W3C "standard" mapping):
 *   12 = D-pad Up, 13 = D-pad Down, 14 = D-pad Left, 15 = D-pad Right
 * Standard axes:
 *   0 = Left stick X (-1 left / +1 right), 1 = Left stick Y (-1 up / +1 down)
 */
export const GAMEPAD_MAPPINGS: GamepadMappingConfig[] = [
  {
    id: "dpad-arrows",
    label: "D-pad → Arrow Keys",
    description:
      "D-pad maps to arrow keys. In the grid view: up/down scroll through items. In the feed view: up/down change slide, left/right seek the video.",
    buttonMappings: {
      12: "ArrowUp",
      13: "ArrowDown",
      14: "ArrowLeft",
      15: "ArrowRight",
    },
    axisMappings: {},
  },
  {
    id: "left-stick-arrows",
    label: "Left Stick → Arrow Keys",
    description:
      "Left analog stick maps to arrow keys. In the grid view: up/down scroll through items. In the feed view: up/down change slide, left/right seek the video.",
    buttonMappings: {},
    axisMappings: {
      0: { negative: "ArrowLeft", positive: "ArrowRight" },
      1: { negative: "ArrowUp", positive: "ArrowDown" },
    },
  },
  {
    id: "right-stick-arrows",
    label: "Right Stick → Arrow Keys",
    description:
      "Right analog stick maps to arrow keys. In the grid view: up/down scroll through items. In the feed view: up/down change slide, left/right seek the video.",
    buttonMappings: {},
    axisMappings: {
      2: { negative: "ArrowLeft", positive: "ArrowRight" },
      3: { negative: "ArrowUp", positive: "ArrowDown" },
    },
  },
];
