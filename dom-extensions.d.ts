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

interface AudioTrackList extends EventTarget {
  readonly length: number;
  getTrackById(id: string): AudioTrack | null;
  [index: number]: AudioTrack;
}

interface HTMLMediaElement {
  readonly audioTracks: AudioTrackList;
}
