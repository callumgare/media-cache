import type { AugmentedEvent } from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { PhotoSwipe, PhotoSwipeEventsMap } from "photoswipe/lightbox";
import { getObjectSanitizer } from "~/lib/general";

declare global {
  interface Window {
    pswp?: PhotoSwipe;
    lightbox?: PhotoSwipeLightbox;
  }
}

type Slide = NonNullable<PhotoSwipe["currSlide"]>;

type Options = Record<never, never>;

export class PhotoSwipeDebugPlugin {
  domMutationObserver: MutationObserver | undefined;
  constructor(lightbox: PhotoSwipeLightbox, options: Options = {}) {
    this.options = options;

    this.domMutationObserver = this.setupDomMutationObserver();

    this.wrapEventDispatch(
      lightbox,
      <eventName extends keyof PhotoSwipeEventsMap>(
        name: eventName,
        details?: PhotoSwipeEventsMap[eventName] | undefined,
      ): AugmentedEvent<eventName> => {
        this.printEventDetails({ name, details, source: "lightbox" });
        return details as AugmentedEvent<eventName>;
      },
    );
    this.initEvents(lightbox);
    lightbox.on("init", () => {
      if (!lightbox.pswp) {
        throw Error("Failed to init");
      }
      this.initEvents(lightbox.pswp);

      setInterval(() => {
        performance.mark(
          `%% - ${document.querySelector(".pswp__zoom-wrap")?.attributes.getNamedItem("style")?.value} - ${document.querySelector(".pswp__zoom-wrap img")?.attributes.getNamedItem("style")?.value}`,
        );
      }, 10);

      this.wrapEventDispatch(
        lightbox.pswp,
        <eventName2 extends keyof PhotoSwipeEventsMap>(
          name: eventName2,
          details?: PhotoSwipeEventsMap[eventName2] | undefined,
        ): AugmentedEvent<eventName2> => {
          this.printEventDetails({
            name,
            details,
            source: "pswp",
            pswp: lightbox.pswp,
          });
          for (const content of lightbox.pswp?.contentLoader._cachedItems ||
            []) {
            if (content.slide) {
              this.attachDomMonitoringToSlide({ slide: content.slide });
            }
          }
          return details as AugmentedEvent<eventName2>;
        },
      );

      this.wrapEventDispatch(
        lightbox,
        <eventName extends keyof PhotoSwipeEventsMap>(
          name: eventName,
          details?: PhotoSwipeEventsMap[eventName] | undefined,
        ): AugmentedEvent<eventName> => {
          this.printEventDetails({ name, details, source: "lightbox" });
          return details as AugmentedEvent<eventName>;
        },
      );

      window.pswp = lightbox.pswp;
    });

    lightbox.on("uiRegister", () => {
      const pswpInstance = lightbox.pswp;
      if (!pswpInstance?.ui) return;
      pswpInstance.ui.registerElement({
        name: "slide-json-dump",
        order: 10,
        isButton: false,
        appendTo: "root",
        onInit: (el: HTMLElement, pswp: PhotoSwipe) => {
          Object.assign(el.style, {
            position: "absolute",
            bottom: "44px",
            left: "0",
            right: "0",
            maxHeight: "250px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.8)",
            color: "#0f0",
            font: "11px/1.5 monospace",
            padding: "8px",
            whiteSpace: "pre",
            pointerEvents: "auto",
            zIndex: "10",
          });

          const makeSanitizer = () =>
            getObjectSanitizer((key, value) => {
              if (value && typeof value === "object") {
                const objName = value.constructor?.name ?? "";
                if (objName === "PhotoSwipe") return "[PhotoSwipe]";
                if (objName.startsWith("HTML") && objName.endsWith("Element"))
                  return `[${objName}]`;
              }
              return value;
            });

          const update = () => {
            const slide = pswp.currSlide;
            if (!slide) {
              el.textContent = "";
              return;
            }
            try {
              el.textContent = JSON.stringify(
                { index: slide.index, data: slide.data },
                makeSanitizer(),
                2,
              );
            } catch {
              el.textContent = "(failed to serialize slide)";
            }
          };

          pswp.on("change", update);
          update();
        },
      });
    });

    window.lightbox = lightbox;
  }

  initEvents(lightboxOrPswp: PhotoSwipe | PhotoSwipeLightbox) {
    lightboxOrPswp.on("slideInit", (event) => {
      this.attachDomMonitoringToSlide.call(this, { slide: event.slide });
    });
  }

  options: Options;

  wrapEventDispatch(
    eventable: PhotoSwipeLightbox | PhotoSwipe,
    callback: PhotoSwipe["dispatch"],
  ) {
    const originalDispatch = eventable.dispatch;
    eventable.dispatch = <eventName extends keyof PhotoSwipeEventsMap>(
      name: eventName,
      details?: PhotoSwipeEventsMap[eventName] | undefined,
    ): AugmentedEvent<eventName> => {
      const processedDetails = callback(name, details) as
        | PhotoSwipeEventsMap[eventName]
        | undefined;
      return originalDispatch.bind(eventable)(name, processedDetails);
    };
  }

  private eventCount = 0;

  printEventDetails({
    name,
    details,
    source,
    pswp,
  }: {
    name: string;
    details: PhotoSwipeEventsMap[keyof PhotoSwipeEventsMap];
    source: string;
    pswp?: PhotoSwipe;
  }) {
    const eventSlide =
      (details &&
        (("slide" in details && details.slide?.content) ||
          ("content" in details && details.content))) ||
      undefined;
    const eventSlideIndex =
      (details && "index" in details ? details.index : undefined) ??
      eventSlide?.index ??
      "N/A";
    const currentSlideIndex = pswp?.currSlide?.index ?? "N/A";
    const eventSlideLoadedSize = Boolean(
      eventSlide?.data.width || eventSlide?.data.height,
    );

    const objectSanitizer = getObjectSanitizer((key, value) => {
      if (value && typeof value === "object") {
        const objName = value.constructor?.name;
        if (objName === "PhotoSwipe") {
          return "[pswp]";
        }
      }
      return value;
    });

    const cake =
      typeof details === "undefined"
        ? details
        : JSON.parse(JSON.stringify(details, objectSanitizer));

    performance.mark(`photoswipe event - ${name}`, {
      detail: {
        eventDetails: cake,
        // customDetails: pswp._customLoggingDetails,
      },
    });

    const valueStyle = "color: green;";
    const defaultStyle = "";

    console.groupCollapsed(
      `    %c${`[${name} from ${source}]`.padEnd(32, " ")} ` +
        `%c#%c${++this.eventCount}%c Current: %c${currentSlideIndex} %cEvent: %c${eventSlideIndex}%c ` +
        `Has: [Size: %c${eventSlideLoadedSize} %cElm: %c${Boolean(eventSlide?.element)} %cPlaceholder: %c${Boolean(eventSlide?.placeholder?.element)}%c] ` +
        `Page vids: %c${document.querySelectorAll("video").length}`,
      "font-weight: bold;",
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
    );
    if (details) {
      console.log("      Details:", details);
    }
    console.groupEnd();
  }

  createdSlides = new Map<Slide, boolean>();
  createdElements = new Map<HTMLElement, boolean>();
  createdPlaceholders = new Map<HTMLElement, boolean>();

  attachDomMonitoringToSlide({ slide }: { slide: Slide }) {
    if (slide.content.element) {
      slide.content.element = this.monitorElementForChanges(
        slide.content.element,
      );
    }
    if (!this.createdSlides.has(slide)) {
      this.createdSlides.set(slide, true);
    }

    const element = slide.content.element;
    if (element && !this.createdElements.has(element)) {
      this.createdElements.set(element, true);
    }

    const placeholder = slide.content.placeholder?.element;
    if (placeholder && !this.createdElements.has(placeholder)) {
      this.createdElements.set(placeholder, true);
      // console.log("Created placeholder:", placeholder)
    }
  }

  proxyRegistry = new WeakMap<HTMLElement, HTMLElement>();
  monitorElementForChanges<Elm extends HTMLElement>(element: Elm): Elm {
    return element;
  }

  setupDomMutationObserver(): MutationObserver | undefined {
    return undefined;
  }
}
