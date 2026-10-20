"""Stop-motion screen recorder for the promo captures.

Playwright's built-in video recorder produces soft, low-bitrate VP8. Instead we drive the page step by step and take a
lossless-ish CDP screenshot after every step, one screenshot per output frame (30 fps). Each frame takes a fixed amount
of real time (FRAME_REAL seconds); CSS animations/transitions are slowed by the same factor through the CDP Animation
domain, so on-screen motion (dnd drop animations, antd modals, menus) plays back at its natural speed in the video.

A fake cursor is injected into every page because headless screenshots do not include the OS pointer.
"""

from __future__ import annotations

import base64
import math
import os
import time
from dataclasses import dataclass, field

FPS = 30

CURSOR_JS = r"""
(() => {
  if (window.__promoCursor) return;
  window.__promoCursor = true;
  const install = () => {
    if (!document.body) { requestAnimationFrame(install); return; }
    const c = document.createElement('div');
    c.id = '__promo_cursor';
    c.innerHTML = `<svg width="26" height="32" viewBox="0 0 26 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2 L2 26 L8.5 20 L13 30 L17 28.2 L12.6 18.6 L21.5 18.6 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
    Object.assign(c.style, {position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(-3px,-2px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', display: 'none'});
    const ring = document.createElement('div');
    ring.id = '__promo_ring';
    Object.assign(ring.style, {position: 'fixed', width: '34px', height: '34px', marginLeft: '-17px', marginTop: '-17px',
      borderRadius: '50%', background: 'rgba(22,119,255,.28)', border: '2px solid rgba(22,119,255,.75)', zIndex: 2147483646,
      pointerEvents: 'none', display: 'none'});
    document.body.appendChild(ring);
    document.body.appendChild(c);
    const move = (e) => { c.style.display = 'block'; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px';
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('mousedown', (e) => { move(e); ring.style.display = 'block'; }, true);
    window.addEventListener('mouseup', () => { ring.style.display = 'none'; }, true);
    // Scrollbars look noisy in a video.
    const st = document.createElement('style');
    st.textContent = '::-webkit-scrollbar{width:0!important;height:0!important}';
    document.head.appendChild(st);
  };
  install();
})();
"""


def ease_in_out(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * t)


@dataclass
class Rec:
    """Records one or more pages in lock-step. Every call to frame() adds one frame per page."""

    pages: dict  # name -> playwright Page
    outdir: str
    frame_real: float = 0.12
    quality: int = 94
    count: int = 0
    _cdp: dict = field(default_factory=dict)
    _mouse: dict = field(default_factory=dict)

    def __post_init__(self):
        for name, page in self.pages.items():
            os.makedirs(os.path.join(self.outdir, name), exist_ok=True)
            self._cdp[name] = page.context.new_cdp_session(page)
            self._mouse[name] = (0.0, 0.0)
        self.slow_animations()

    # -- animation speed -------------------------------------------------------------------------------------------
    def slow_animations(self):
        rate = (1.0 / FPS) / self.frame_real
        for cdp in self._cdp.values():
            cdp.send("Animation.enable")
            cdp.send("Animation.setPlaybackRate", {"playbackRate": rate})

    # -- frames ----------------------------------------------------------------------------------------------------
    def frame(self, n: int = 1):
        for _ in range(n):
            start = time.time()
            for name, cdp in self._cdp.items():
                shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": self.quality})
                with open(os.path.join(self.outdir, name, f"{self.count:05d}.jpg"), "wb") as fh:
                    fh.write(base64.b64decode(shot["data"]))
            self.count += 1
            left = self.frame_real - (time.time() - start)
            if left > 0:
                time.sleep(left)

    def hold(self, seconds: float):
        self.frame(max(1, round(seconds * FPS)))

    def wait_real(self, page_name: str, fn, seconds_budget: float = 3.0):
        """Run a blocking action (e.g. navigation) while still producing frames is not possible; just run it."""
        fn()

    # -- mouse -----------------------------------------------------------------------------------------------------
    def glide(self, name: str, x: float, y: float, seconds: float = 0.8, arc: float = 0.0, hold_frames: int = 0):
        page = self.pages[name]
        x0, y0 = self._mouse[name]
        n = max(2, round(seconds * FPS))
        for i in range(1, n + 1):
            t = ease_in_out(i / n)
            # optional arc perpendicular to the path, looks more like a human hand
            ox = -(y - y0) * arc * math.sin(math.pi * t) / max(1.0, math.hypot(x - x0, y - y0)) * 60
            oy = (x - x0) * arc * math.sin(math.pi * t) / max(1.0, math.hypot(x - x0, y - y0)) * 60
            px, py = x0 + (x - x0) * t + ox, y0 + (y - y0) * t + oy
            page.mouse.move(px, py)
            self.frame()
        self._mouse[name] = (x, y)
        if hold_frames:
            self.frame(hold_frames)

    def set_mouse(self, name: str, x: float, y: float):
        self.pages[name].mouse.move(x, y)
        self._mouse[name] = (x, y)

    def click(self, name: str, button: str = "left", frames_down: int = 3):
        page = self.pages[name]
        page.mouse.down(button=button)
        self.frame(frames_down)
        page.mouse.up(button=button)
        self.frame()

    def drag(self, name: str, x: float, y: float, seconds: float = 1.6, arc: float = 0.15):
        """Press, wiggle a little to start the dnd sensor, move along an arc, release and let the drop animation play."""
        page = self.pages[name]
        x0, y0 = self._mouse[name]
        page.mouse.down()
        self.frame(4)
        for k in range(1, 6):  # pass the drag-start threshold smoothly
            page.mouse.move(x0 + k * 2, y0 - k)
            self.frame()
        self._mouse[name] = (x0 + 10, y0 - 5)
        self.glide(name, x, y, seconds, arc=arc)
        self.frame(6)
        page.mouse.up()
        self.frame()

    def type(self, name: str, text: str, per_char_frames: int = 2):
        page = self.pages[name]
        for ch in text:
            page.keyboard.type(ch)
            self.frame(per_char_frames)

    def center(self, name: str, locator, dx: float = 0, dy: float = 0):
        box = locator.bounding_box()
        if box is None:
            raise RuntimeError(f"element not visible: {locator}")
        return box["x"] + box["width"] / 2 + dx, box["y"] + box["height"] / 2 + dy
