// Register video.js v10 custom elements on the client only.
// These imports must not run on the server because @videojs/element
// accesses `HTMLElement` at module-evaluation time, which doesn't exist in Node.
import "@videojs/html/video/player";
import "@videojs/html/video/minimal-skin";
import "@videojs/html/media/hls-video";
import "@videojs/html/media/dash-video";

export default defineNuxtPlugin(() => {});
