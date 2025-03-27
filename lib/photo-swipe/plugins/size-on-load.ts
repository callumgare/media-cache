import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { Content, PhotoSwipe, PhotoSwipeEventsMap } from 'photoswipe/lightbox'
import { isMediaElement, mediaElementSize } from '~/lib/dom'

type Options = Record<never, never>

export class PhotoSwipeSizeOnLoadPlugin {
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
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
    // Currently we don't init anything
    lightbox
  }

  initPswpEvents(pswp: PhotoSwipe) {
    pswp.on('contentLoadImage', (event) => {
      this.detectSlideSize({ content: event.content, pswp })
    })
    pswp.on('openingAnimationStart', () => {
      // We don't know the dimensions of our media when we first load so it will initially be position and the top left
      // but once the dimensions are detected and the media updated then by default it will animate from the corner into
      // position. By turning this off we don't have that jarring effect. We later turn it back on after the size is known.
      if (!pswp.currSlide?.width || !pswp.currSlide?.height) {
        pswp.opener._animateZoom = false
      }
    })
    pswp.on('openingAnimationEnd', () => {
      pswp.opener._animateZoom = true
    })
    pswp.on('contentLoad', (event) => {
      this.detectSlideSize({ content: event.content, pswp })
    })
    pswp.on('contentAppend', (event) => {
      this.detectSlideSize({ content: event.content, pswp })
    })
    pswp.on('initialZoomPan', (event) => {
      this.detectSlideSize({ content: event.slide.content, pswp })
    })
    pswp.on('initialZoomPan', (event) => {
      this.centerLoadingSlideMedia({ content: event.slide.content })
    })
    pswp.on('contentResize', (event) => {
      this.detectSlideSize({ content: event.content, pswp })
      this.centerLoadingSlideMedia({ content: event.content })
    })
    pswp.on('resize', () => {
      if (pswp.currSlide) {
        this.centerLoadingSlideMedia({ content: pswp.currSlide.content })
      }
    })
  }

  updateLoadedSlideSizesIfNeeded(pswp: PhotoSwipe) {
    const slidesInDom = pswp.mainScroll.itemHolders
      .map(item => item.slide)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    const updateNeeded = slidesInDom.some(slide => (slide.data.width || slide.data.height) && (!slide.width && !slide.height))
    if (updateNeeded) {
      pswp.updateSize(true)
    }
  }

  handleChange(event: PhotoSwipeEventsMap['change'], pswp: PhotoSwipe) {
    if (pswp.currSlide) {
      pswp.currSlide.applyCurrentZoomPan()
      this.updateLoadedSlideSizesIfNeeded(pswp)
    }
  }

  centeringCss = {
    left: '50vw',
    top: '50vh',
    maxWidth: '100vw',
    maxHeight: '100vh',
    transform: 'translate(-50%, -50%)',
    position: 'fixed',
    width: 'initial',
    height: 'initial',
  } as const

  centerLoadingMedia(mediaElement: HTMLElement) {
    for (const [key, value] of Object.entries(this.centeringCss)) {
      mediaElement.style[key as keyof typeof this.centeringCss] = value
    }
  }

  uncenterLoadingMedia(mediaElement: HTMLElement) {
    for (const [key, value] of Object.entries(this.centeringCss)) {
      if (mediaElement.style[key as keyof typeof this.centeringCss] === value) {
        mediaElement.style[key as keyof typeof this.centeringCss] = ''
      }
    }
  }

  centerLoadingSlideMedia({ content }: { content: Content }) {
    const sizeKnown = Boolean(content.data.width || content.data.height)

    if (sizeKnown) {
      content.instance.opener._animateZoom = true
    }
    if (content.element) {
      if (!sizeKnown) {
        this.centerLoadingMedia(content.element)
      }
      else {
        this.uncenterLoadingMedia(content.element)
      }
    }
    if (content.placeholder?.element) {
      if (!sizeKnown) {
        this.centerLoadingMedia(content.placeholder.element)
      }
      else {
        this.uncenterLoadingMedia(content.placeholder.element)
      }
    }
  }

  private mediaCurrentlyLoading: WeakMap<HTMLElement, boolean> = new WeakMap()

  detectSlideMediaSize({ content, mediaElement, pswp }: { content: Content, mediaElement: HTMLElement, pswp: PhotoSwipe }) {
    if (content.data.width || content.data.height || !mediaElement || this.mediaCurrentlyLoading.get(mediaElement)) return
    this.mediaCurrentlyLoading.set(mediaElement, true)

    const mediaSizeLoadedHandler = () => {
      this.mediaCurrentlyLoading.delete(mediaElement)
      this.updateSlideSizeFromMedia({ content, pswp })
    }

    if (mediaElement instanceof HTMLVideoElement) {
      mediaElement.addEventListener('loadedmetadata', mediaSizeLoadedHandler)
      if (mediaElement.videoWidth || mediaElement.videoHeight) {
        mediaSizeLoadedHandler({ type: 'already loaded' })
      }
    }
    else if (mediaElement instanceof HTMLImageElement) {
      // There's no event that fires right after the size is known
      // (load fires after image is fully loaded) so we have to poll
      const internalId = setInterval(() => {
        if (mediaElement.naturalWidth || mediaElement.naturalHeight) {
          clearInterval(internalId)
          mediaSizeLoadedHandler({ type: 'already loaded' })
        }
      }, 50)
    }
    else {
      // PhotoSwipe seems to uses Divs as a placeholder element at points so we just ignore it if it's not a media element
    }
  }

  updateSlideSizeFromMedia({ content, pswp }: { content: Content, pswp: PhotoSwipe }) {
    // The slide might have been given a size at some point after we registered an event listener
    // to run this function on media load.
    if (content.data.width || content.data.height) return

    const mediaElement = content.element
    const placeholderElement = content.placeholder?.element

    let mediaSize

    if (isMediaElement(mediaElement)) {
      mediaSize = mediaElementSize(mediaElement)
      content.data.width = mediaSize.width
      content.data.height = mediaSize.height
    }
    else if (isMediaElement(placeholderElement)) {
      mediaSize = mediaElementSize(placeholderElement)
    }
    else {
      throw Error('Slide has no element')
    }

    if (mediaSize) {
      content.width = mediaSize.width
      content.height = mediaSize.height
      if (content.slide) {
        content.slide.width = mediaSize.width
        content.slide.height = mediaSize.height
        content.slide.currZoomLevel = content.slide.zoomLevels.initial
        content.slide.resize()
      }
    }
    this.updateLoadedSlideSizesIfNeeded(pswp)
  }

  detectSlideSize({ content, pswp }: { content: Content, pswp: PhotoSwipe }) {
    const sizeKnown = Boolean(content.data.width || content.data.height)
    if (content.element) {
      if (!sizeKnown) {
        this.detectSlideMediaSize({ content, mediaElement: content.element, pswp })
      }
    }
    if (content.placeholder?.element) {
      if (!sizeKnown) {
        this.detectSlideMediaSize({ content, mediaElement: content.placeholder.element, pswp })
      }
    }
  }
}
