export function isMediaElement(mediaElement: unknown): mediaElement is HTMLVideoElement | HTMLImageElement {
  return (mediaElement instanceof HTMLVideoElement)
    || (mediaElement instanceof HTMLImageElement)
}

export function mediaElementHasSize(mediaElement: HTMLElement) {
  if (mediaElement instanceof HTMLVideoElement) {
    return Boolean(mediaElement.videoWidth || mediaElement.videoHeight)
  }
  else if (mediaElement instanceof HTMLImageElement) {
    return Boolean(mediaElement.naturalWidth || mediaElement.naturalHeight)
  }
  else {
    throw Error(`Unknown element "${mediaElement.tagName}"`)
  }
}

export function mediaElementSize(mediaElement: HTMLElement) {
  if (mediaElement instanceof HTMLVideoElement) {
    return {
      width: mediaElement.videoWidth,
      height: mediaElement.videoHeight,
    }
  }
  else if (mediaElement instanceof HTMLImageElement) {
    return {
      width: mediaElement.naturalWidth,
      height: mediaElement.naturalHeight,
    }
  }
  else {
    throw Error(`Unknown element "${mediaElement.tagName}"`)
  }
}
