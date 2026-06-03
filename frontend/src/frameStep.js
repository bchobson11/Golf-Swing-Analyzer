// Frame-by-frame stepping for a <video> via the arrow keys.
//
// HTML5 video has no native frame step, so we nudge currentTime by one frame
// (1/fps). Left/Right = one frame; Shift+Left/Right = 10 frames. Scoped to the
// focused video element so multiple players on a page don't fight over keys.

export function frameStepKeyDown(e, video, fps) {
  if (!video || !fps) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  video.pause();
  const frames = e.shiftKey ? 10 : 1;
  const dir = e.key === "ArrowRight" ? 1 : -1;
  const limit = isFinite(video.duration) ? video.duration : Infinity;
  video.currentTime = Math.max(0, Math.min(limit, video.currentTime + (dir * frames) / fps));
}
