interface VideoControls {
  seekForward: () => void;
  seekBackward: () => void;
  startFastForward: () => void;
  startRewind: () => void;
  stopFastSeek: () => void;
  togglePlayPause: () => void;
}

// Module-level singleton — shared across all component instances
const registeredId = ref<symbol | null>(null);
const currentControls = shallowRef<VideoControls | null>(null);

export function useCurrentVideoControls() {
  return {
    register(id: symbol, controls: VideoControls) {
      registeredId.value = id;
      currentControls.value = controls;
    },
    unregisterById(id: symbol) {
      if (registeredId.value === id) {
        registeredId.value = null;
        currentControls.value = null;
      }
    },
    seekForward: () => currentControls.value?.seekForward(),
    seekBackward: () => currentControls.value?.seekBackward(),
    startFastForward: () => currentControls.value?.startFastForward(),
    startRewind: () => currentControls.value?.startRewind(),
    stopFastSeek: () => currentControls.value?.stopFastSeek(),
    togglePlayPause: () => currentControls.value?.togglePlayPause(),
  };
}
