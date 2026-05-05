import type { APIMediaData } from '@@/types/api-media'

// Module-level reactive state — there is only one PhotoSwipe instance at a time.
const isOpen = ref(false)
const currentMedia = ref<APIMediaData | null>(null)
// The HTMLElement created by the plugin that serves as the Teleport target.
const panelEl = ref<HTMLElement | null>(null)

// The plugin injects its own setOpen so it can also manage CSS classes on pswp.template.
// When null (plugin not active) open/close/toggle update isOpen directly.
let _setOpen: ((open: boolean) => void) | null = null

export function useInfoPanel() {
  function open() {
    if (_setOpen) _setOpen(true)
    else isOpen.value = true
  }
  function close() {
    if (_setOpen) _setOpen(false)
    else isOpen.value = false
  }
  function toggle() {
    if (_setOpen) _setOpen(!isOpen.value)
    else isOpen.value = !isOpen.value
  }

  /** @internal — called only by PhotoSwipeInfoPanelPlugin */
  function _registerSetOpen(fn: ((open: boolean) => void) | null) {
    _setOpen = fn
  }

  return { isOpen, currentMedia, panelEl, open, close, toggle, _registerSetOpen }
}
