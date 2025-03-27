// @ts-expect-error -- photoswipe-video-plugin does not have ts types yet
import PhotoSwipeVideoPlugin from 'photoswipe-video-plugin'

import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { PhotoSwipe } from 'photoswipe/lightbox'

type Options = Record<never, never>

export class PhotoSwipeCustomVideoPlugin extends PhotoSwipeVideoPlugin {
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
    super(lightbox, options)

    this.options = options

    this.initLightboxEvents(lightbox)

    lightbox.on('init', () => {
      if (!lightbox.pswp) {
        throw Error('Failed to init')
      }
      this.initPswpEvents(lightbox.pswp)
    })
  }

  options: Options

  initLightboxEvents(lightbox: PhotoSwipeLightbox) {
    lightbox.on('afterInit', () => {
      lightbox.pswp?._listeners.appendHeavy?.shift()
    })
  }

  initPswpEvents(pswp: PhotoSwipe) {
    // We currently don't init anything
    pswp
  }
}
