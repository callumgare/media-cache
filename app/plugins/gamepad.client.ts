// Client-only plugin: starts the gamepad polling loop for the lifetime of the app.
export default defineNuxtPlugin(() => {
  const { start, stop } = useGamepadPolling();
  const toast = useToast();

  window.addEventListener("gamepadconnected", (e) => {
    toast.add({
      severity: "info",
      summary: "Gamepad connected",
      detail: e.gamepad.id,
      life: 4000,
    });
    start();
  });

  window.addEventListener("gamepaddisconnected", () => {
    if (!navigator.getGamepads().some(Boolean)) {
      stop();
    }
  });
});
