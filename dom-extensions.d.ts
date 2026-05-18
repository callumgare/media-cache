/**
 * TypeScript 6's DOM lib omitted AudioTrack/AudioTrackList because Firefox
 * dropped the API. Chrome and Safari still support it, and we use it for
 * loop-threshold detection. Re-declare the minimum surface we need.
 */

interface AudioTrack {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly language: string;
  enabled: boolean;
}

/**
 * @videojs/html's hls-video element proxies all HTMLVideoElement properties
 * via its media engine, so we declare it as extending HTMLVideoElement for
 * TypeScript compatibility. The element uses hls.js internally on browsers
 * that don't support native HLS (Chrome/Firefox) and falls back to the
 * native player on Safari.
 */
interface HlsVideoElement extends HTMLVideoElement {}

/**
 * @videojs/html's dash-video element — same proxy pattern as hls-video but
 * for MPEG-DASH streams (dash.js internally, native DASH on Safari).
 */
interface DashVideoElement extends HTMLVideoElement {}

declare global {
  interface HTMLElementTagNameMap {
    "hls-video": HlsVideoElement;
    "dash-video": DashVideoElement;
  }
}

interface AudioTrackList extends EventTarget {
  readonly length: number;
  getTrackById(id: string): AudioTrack | null;
  [index: number]: AudioTrack;
}

interface HTMLMediaElement {
  readonly audioTracks: AudioTrackList;
}
