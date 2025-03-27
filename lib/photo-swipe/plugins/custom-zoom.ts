import type { Point } from 'photoswipe'
import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { PhotoSwipe } from 'photoswipe/lightbox'

type Slide = NonNullable<PhotoSwipe['currSlide']>

type Options = Record<never, never>

export class PhotoSwipeCustomZoomPlugin {
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
    this.options = options

    this.initEvents(lightbox)
    lightbox.on('init', () => {
      if (!lightbox.pswp) {
        throw Error('Failed to init')
      }
      this.initEvents(lightbox.pswp)
      // this.logPswpEvents(lightbox.pswp)

      lightbox.pswp.addFilter('isContentZoomable', () => {
        // Override video block on zooming
        return true
      })

      lightbox.pswp.on('beforeResize', () => {
        // Needed to force PhotoSwipe to recalculate the zoom button visibility on resize.
        // (https://github.com/dimsemenov/PhotoSwipe/blob/d80c32a62b169e776ad1c983d1fcdc6eea8b48e0/src/js/ui/ui.js#L112)
        // Even though the current zoom level, changing the window size changes if it's possible to zoom or not.
        lightbox.pswp.ui._lastUpdatedZoomLevel = -1
      })

      // The init event occurs before PhotoSwipe's zoomPanUpdate listen is registered so this is called first
      // https://github.com/dimsemenov/PhotoSwipe/blob/d80c32a62b169e776ad1c983d1fcdc6eea8b48e0/src/js/ui/ui.js#L76
      lightbox.pswp.on('zoomPanUpdate', (event) => {
        // The secondary zoom level is hardcoded to max at 1 but that will mean the
        // zoom button when won't be shown (
        // https://github.com/dimsemenov/PhotoSwipe/blob/d80c32a62b169e776ad1c983d1fcdc6eea8b48e0/src/js/ui/ui.js#L117)
        // so we manually set the secondary zoom level just before the zoom button visibility is
        // calculated
        event.slide.zoomLevels.secondary = 100
        lightbox.pswp.ui._lastUpdatedZoomLevel = -1
        return event
      })
      lightbox.pswp.on('slideInit', (event) => {
        this.modifyZoomFunction.call(this, event.slide)
      })
    })

    lightbox.on('firstUpdate', () => {
      // The firstUpdate event occurs after PhotoSwipe's zoomPanUpdate listen is registered so this is called after that
      // https://github.com/dimsemenov/PhotoSwipe/blob/d80c32a62b169e776ad1c983d1fcdc6eea8b48e0/src/js/ui/ui.js#L76
      lightbox.pswp.on('zoomPanUpdate', (event) => {
        const slide = event.slide
        const canZoomInMore = this.getNextZoomLevel(slide) > slide.currZoomLevel
        lightbox.pswp?.template?.classList.toggle('pswp--zoomed-in', !canZoomInMore)
        return event
      })
    })
  }

  initEvents(lightboxOrPswp: PhotoSwipe | PhotoSwipeLightbox) {
    lightboxOrPswp.on('slideInit', () => {
    })
  }

  modifyZoomFunction(slide: Slide) {
    slide.toggleZoom = (centerPoint: Point) => {
      const { zoomLevels } = slide
      if (!zoomLevels.panAreaSize || !zoomLevels.elementSize) {
        return
      }

      const nextZoomLevel = this.getNextZoomLevel(slide)
      slide.zoomTo(
        nextZoomLevel,
        centerPoint,
        slide.pswp.options.zoomAnimationDuration,
      )
    }
  }

  getCustomZoomLevels(slide: Slide) {
    const { zoomLevels } = slide
    // slide.zoomLevels.fit and slide.zoomLevels.fill seems to have a max value of 1 but we want
    // media that is natually smaller than the viewport to still be able
    // to zoom to fit/fill. So we have to calculate those zoom levels ourselves.
    const fit = (
      (zoomLevels.panAreaSize.x / zoomLevels.elementSize.x)
      < (zoomLevels.panAreaSize.y / zoomLevels.elementSize.y)
    )
      ? (zoomLevels.panAreaSize.x / zoomLevels.elementSize.x)
      : (zoomLevels.panAreaSize.y / zoomLevels.elementSize.y)
    const fill = (
      (zoomLevels.panAreaSize.x / zoomLevels.elementSize.x)
      > (zoomLevels.panAreaSize.y / zoomLevels.elementSize.y)
    )
      ? (zoomLevels.panAreaSize.x / zoomLevels.elementSize.x)
      : (zoomLevels.panAreaSize.y / zoomLevels.elementSize.y)
    const naturalSize = 1
    // These are the different possible zooms:
    // natural size under flow, x2 under flow, fit, fill, natural size over flow
    const possibleZoomLevels = [
      Math.min(fit, naturalSize),
      fit > 2 ? 2 : undefined, // Add a x2 zoom level if it's smaller than the fit size
      fit,
      // Add a fill zoom level if fit isn't already equal to or larger than the media's natural size
      (fit < naturalSize) || (Math.abs(fit - naturalSize) < 0.2) ? fill : undefined,
      // Add a natural size zoom level if fill isn't already equal to or larger than the media's natural size
      fill < naturalSize ? naturalSize : undefined,
    ]
    // Remove duplicate zoom levels
    return possibleZoomLevels
      .filter(level => typeof level === 'number')
      .reduce((acc, zoomLevel) => {
        const zoomLevelCeil = Math.min(zoomLevel, zoomLevels.max)
        const currentBiggestZoomLevel = acc[acc.length - 1] ?? -1
        const zoomLevelDiff = zoomLevelCeil - currentBiggestZoomLevel
        if (zoomLevelDiff > 0.2) {
          acc.push(zoomLevelCeil)
        }
        return acc
      }, [] as number[])
  }

  getNextZoomLevel(slide: Slide) {
    const customZoomLevels = this.getCustomZoomLevels(slide)
    return customZoomLevels.find(zoomLevel => zoomLevel > slide.currZoomLevel) ?? customZoomLevels[0]
  }

  options: Options
}
