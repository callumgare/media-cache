import type { VideoStartPosition } from "~~/server/database/schema";

export const videoStartPositionOptions = [
  { label: "Beginning of video", value: "start" },
  { label: "Random point", value: "random" },
] satisfies { label: string; value: VideoStartPosition }[];
