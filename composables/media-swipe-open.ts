import type PhotoSwipeLightbox from 'photoswipe/lightbox'

let _photoSwipe: PhotoSwipeLightbox
export function registerMediaSwipe(photoSwipe: PhotoSwipeLightbox) {
  _photoSwipe = photoSwipe
}

export function useMediaSwipeOpen() {
  return (slideIndex: number) => _photoSwipe?.loadAndOpen(slideIndex)
}
