import type { AugmentedEvent } from 'photoswipe'
import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import type { PhotoSwipe, PhotoSwipeEventsMap } from 'photoswipe/lightbox'
import { getObjectSanitizer } from '~/lib/general'

type Slide = NonNullable<PhotoSwipe['currSlide']>

type Options = Record<never, never>

export class PhotoSwipeDebugPlugin {
  domMutationObserver = MutationObserver['prototype']
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
    this.options = options

    this.domMutationObserver = this.setupDomMutationObserver()

    this.wrapEventDispatch(
      lightbox,
      <eventName extends keyof PhotoSwipeEventsMap>(
        name: eventName, details?: PhotoSwipeEventsMap[eventName] | undefined,
      ): AugmentedEvent<eventName> => {
        this.printEventDetails({ name, details, source: 'lightbox' })
        return details as AugmentedEvent<eventName>
      },
    )
    this.initEvents(lightbox)
    lightbox.on('init', () => {
      if (!lightbox.pswp) {
        throw Error('Failed to init')
      }
      this.initEvents(lightbox.pswp)

      setInterval(() => {
        performance.mark(`%% - ${document.querySelector('.pswp__zoom-wrap')?.attributes.style.value} - ${document.querySelector('.pswp__zoom-wrap img')?.attributes.style.value}`)
      }, 10)

      this.wrapEventDispatch(
        lightbox.pswp,
        (
          name, details,
        ) => {
          this.printEventDetails({ name, details, source: 'pswp', pswp: lightbox.pswp })
          for (const content of lightbox.pswp?.contentLoader._cachedItems || []) {
            if (content.slide) {
              this.attachDomMonitoringToSlide({ slide: content.slide })
            }
          }
          return details as AugmentedEvent<eventName>
        },
      )

      this.wrapEventDispatch(
        lightbox,
        <eventName extends keyof PhotoSwipeEventsMap>(
          name: eventName, details?: PhotoSwipeEventsMap[eventName] | undefined,
        ): AugmentedEvent<eventName> => {
          this.printEventDetails({ name, details, source: 'lightbox' })
          return details as AugmentedEvent<eventName>
        },
      )

      window.pswp = lightbox.pswp
    })

    window.lightbox = lightbox
  }

  initEvents(lightboxOrPswp: PhotoSwipe | PhotoSwipeLightbox) {
    lightboxOrPswp.on('slideInit', (event) => {
      this.attachDomMonitoringToSlide.call(this, { slide: event.slide })
    })
  }

  options: Options

  wrapEventDispatch(eventable: PhotoSwipeLightbox | PhotoSwipe, callback: PhotoSwipe['dispatch']) {
    const originalDispatch = eventable.dispatch
    eventable.dispatch = function<eventName extends keyof PhotoSwipeEventsMap> (
      name: eventName,
      details?: PhotoSwipeEventsMap[eventName] | undefined,
    ): AugmentedEvent<eventName> {
      details = callback(name, details) as PhotoSwipeEventsMap[eventName] | undefined
      return originalDispatch.bind(eventable)(name, details)
    }
  }

  private eventCount = 0

  printEventDetails({ name, details, source, pswp }: { name: string, details: PhotoSwipeEventsMap[keyof PhotoSwipeEventsMap], source: string, pswp?: PhotoSwipe }) {
    const eventSlide = (
      details && (
        ('slide' in details && details.slide?.content) || ('content' in details && details.content)
      )
    ) || undefined
    const eventSlideIndex = ((details && 'index' in details) ? details.index : undefined) ?? eventSlide?.index ?? 'N/A'
    const currentSlideIndex = pswp?.currSlide?.index ?? 'N/A'
    const eventSlideLoadedSize = Boolean(eventSlide?.data.width || eventSlide?.data.height)

    const objectSanitizer = getObjectSanitizer((key, value) => {
      if (value && typeof value === 'object') {
        const objName = value.constructor.name
        if (objName === 'PhotoSwipe') {
          return '[pswp]'
        }
      }
      return value
    })

    const cake = typeof details === 'undefined' ? details : JSON.parse(JSON.stringify(details, objectSanitizer))

    performance.mark(`photoswipe event - ${name}`, {
      detail: {
        eventDetails: cake,
        // customDetails: pswp._customLoggingDetails,
      },
    })

    const valueStyle = 'color: green;'
    const defaultStyle = ''

    console.groupCollapsed(
      `    %c${`[${name} from ${source}]`.padEnd(32, ' ')} `
      + `%c#%c${++this.eventCount}%c Current: %c${currentSlideIndex} %cEvent: %c${eventSlideIndex}%c `
      + `Has: [Size: %c${eventSlideLoadedSize} %cElm: %c${Boolean(eventSlide?.element)} %cPlaceholder: %c${Boolean(eventSlide?.placeholder?.element)}%c] `
      + `Page vids: %c${document.querySelectorAll('video').length}`,
      'font-weight: bold;',
      defaultStyle,
      valueStyle, // eventCount
      defaultStyle,
      valueStyle, // current
      defaultStyle,
      valueStyle, // event
      defaultStyle,
      valueStyle, // size
      defaultStyle,
      valueStyle, // elm
      defaultStyle,
      valueStyle, // placeholder
      defaultStyle,
      valueStyle, // vids count
    )
    if (details) {
      console.log('      Details:', details)
    }
    console.groupEnd()
  }

  createdSlides = new Map<Slide, boolean>()
  createdElements = new Map<HTMLElement, boolean>()
  createdPlaceholders = new Map<HTMLElement, boolean>()

  attachDomMonitoringToSlide({ slide }: { slide: Slide }) {
    if (slide.content.element) {
      slide.content.element = this.monitorElementForChanges(slide.content.element)
    }
    if (!this.createdSlides.has(slide)) {
      this.createdSlides.set(slide, true)
    }

    const element = slide.content.element
    if (element && !this.createdElements.has(element)) {
      this.createdElements.set(element, true)
    }

    const placeholder = slide.content.placeholder?.element
    if (placeholder && !this.createdElements.has(placeholder)) {
      this.createdElements.set(placeholder, true)
      // console.log("Created placeholder:", placeholder)
    }
  }

  proxyRegistry = new WeakMap<HTMLElement, HTMLElement>()
  monitorElementForChanges<Elm extends HTMLElement>(element: Elm): Elm {
    return element

    let proxiedElement = this.proxyRegistry.get(element) as Elm | undefined

    if (!proxiedElement) {
      console.log('((((((( Creating element proxy', element)
      proxiedElement = new Proxy(element, {
        set(target, key, value) {
          if (target[key] !== value) {
            console.log(`Property '${key}' changed from '${target[key]}' to '${value}'`)
          }
          target[key] = value
          return true
        },
        get(target, key) {
          if (key === 'setAttribute') {
            return function (attr, value) {
              if (target.getAttribute(attr) !== value) {
                console.log(`Attribute '${attr}' changed from '${target.getAttribute(attr)}' to '${value}'`)
              }
              return target.setAttribute(attr, value)
            }
          }
          if (key === 'getAttribute') {
            return function (attr) {
              return target.getAttribute(attr)
            }
          }
          return target[key]
        },
      })
      this.proxyRegistry.set(element, proxiedElement)
      this.proxyRegistry.set(proxiedElement, proxiedElement)
    }

    return proxiedElement
  }

  setupDomMutationObserver(): MutationObserver {
    return
    const detectedInDom = new Map<HTMLElement, boolean>()
    const domMutationObserver = new MutationObserver((mutations) => {
      for (const elm of this.createdElements.keys()) {
        if (!detectedInDom.has(elm) && document.body.contains(elm)) {
          console.log('📈 &&&&3 added to dom', elm)
          detectedInDom.set(elm, true)
        }
        if (detectedInDom.has(elm) && !document.body.contains(elm)) {
          console.log('📉 &&&&3 removed from dom', elm)
          detectedInDom.delete(elm)
        }
      }
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const addedNode of mutation.addedNodes) {
            if (addedNode instanceof HTMLElement && this.createdElements.has(addedNode)) {
              console.log('&&&&1 added to dom', addedNode)
            }
            if (addedNode instanceof HTMLElement && this.createdPlaceholders.has(addedNode)) {
              console.log('&&&&2 added to dom', addedNode)
            }
          }
        }
        else if (mutation.type === 'attributes') {
          for (const elm of this.createdElements.keys()) {
            if (elm === mutation.target) {
              console.log('🌪️ &&&&4 attr changed')
              console.log('  target:', mutation.target)
              console.log('  old val:', mutation.oldValue)
              console.log('  val:', mutation.target?.getAttribute?.(mutation.attributeName))
            }
          }
        }
      }
    })

    domMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,

    })

    return domMutationObserver
  }
}
