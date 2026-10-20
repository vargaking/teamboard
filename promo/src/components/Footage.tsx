import React from 'react';
import { Easing, Freeze, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import clipsJson from '../../public/clips/clips.json';
import { C, FONT } from '../theme';

export type Box = [number, number, number, number]; // CSS px in the capture viewport
type ClipMeta = { frames: number; markers: Record<string, number>; boxes: Record<string, Box | null>; view: { width: number; height: number }; files: string[] };
export const CLIPS = clipsJson as unknown as Record<string, ClipMeta>;

export const clip = (name: string) => {
  const c = CLIPS[name];
  if (!c) throw new Error(`clip ${name} missing - run capture/capture.py`);
  return c;
};
export const marker = (name: string, key: string) => {
  const v = clip(name).markers[key];
  if (v === undefined) throw new Error(`marker ${name}.${key} missing`);
  return v;
};
export const boxOf = (name: string, key: string): Box => {
  const b = clip(name).boxes?.[key];
  if (!b) throw new Error(`box ${name}.${key} missing`);
  return b;
};

/** A piece of a captured clip placed on the scene timeline. Before `from`/after `to` the edge frame is held. */
export type Segment = { clip: string; file?: string; at: number; from?: number; to?: number; rate?: number };

export function resolveSegment(segments: Segment[], frame: number, fps: number) {
  let seg = segments[0];
  for (const s of segments) if (frame >= Math.round(s.at * fps)) seg = s;
  const meta = clip(seg.clip);
  const from = seg.from ?? 0;
  const to = Math.min(seg.to ?? meta.frames - 1, meta.frames - 1);
  const local = (frame - Math.round(seg.at * fps)) * (seg.rate ?? 1);
  const clipFrame = Math.round(Math.max(from, Math.min(to, from + local)));
  return { seg, meta, clipFrame, file: seg.file ?? meta.files[0] };
}

export const ClipFrame: React.FC<{ file: string; frame: number; style?: React.CSSProperties }> = ({ file, frame, style }) => (
  <Freeze frame={frame}>
    <OffthreadVideo src={staticFile(`clips/${file}.mp4`)} muted style={{ width: '100%', height: '100%', display: 'block', ...style }} />
  </Freeze>
);

/** Camera keyframe: (x, y) is the CSS point shown at the centre of the window, s the zoom (1 = whole page). */
export type Cam = { t: number; x?: number; y?: number; s?: number };

export function cameraAt(keys: Cam[], t: number, view: { width: number; height: number }) {
  const full = { x: view.width / 2, y: view.height / 2, s: 1 };
  const norm = keys.map((k) => ({ t: k.t, x: k.x ?? full.x, y: k.y ?? full.y, s: k.s ?? 1 }));
  if (norm.length === 0) return full;
  let cur = norm[0];
  if (t <= norm[0].t) cur = norm[0];
  else if (t >= norm[norm.length - 1].t) cur = norm[norm.length - 1];
  else {
    for (let i = 0; i < norm.length - 1; i++) {
      const a = norm[i];
      const b = norm[i + 1];
      if (t >= a.t && t <= b.t) {
        const p = Easing.inOut(Easing.cubic)((t - a.t) / Math.max(0.001, b.t - a.t));
        cur = { t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s: a.s + (b.s - a.s) * p };
        break;
      }
    }
  }
  // keep the page filling the window
  const halfW = view.width / (2 * cur.s);
  const halfH = view.height / (2 * cur.s);
  return {
    x: Math.min(view.width - halfW, Math.max(halfW, cur.x)),
    y: Math.min(view.height - halfH, Math.max(halfH, cur.y)),
    s: cur.s,
  };
}

/** Focus helper: centre a box and zoom so that it occupies `fill` of the window width. (`_t` is ignored; kept for readability at call sites.) */
export const focus = (_t: number, b: Box, view: { width: number; height: number }, fill = 0.6, maxS = 2.2) => ({
  x: b[0] + b[2] / 2,
  y: b[1] + b[3] / 2,
  s: Math.max(1, Math.min(maxS, (view.width * fill) / b[2], (view.height * 0.85) / b[3])),
});

export type Highlight = { box: Box; from: number; to: number; color?: string; dim?: boolean; radius?: number };

/** Map a CSS point of the capture into window pixels for the current camera. */
export function project(cam: { x: number; y: number; s: number }, base: number, w: number, h: number, x: number, y: number) {
  return { x: w / 2 + (x - cam.x) * base * cam.s, y: h / 2 + (y - cam.y) * base * cam.s };
}

type FootageProps = {
  segments: Segment[];
  width: number; // window content size in px
  cams?: Cam[];
  highlights?: Highlight[];
  sceneFrame?: number; // frame inside the scene (defaults to useCurrentFrame)
};

export const Footage: React.FC<FootageProps> = ({ segments, width, cams = [], highlights = [], sceneFrame }) => {
  const current = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = sceneFrame ?? current;
  const { meta, clipFrame, file } = resolveSegment(segments, frame, fps);
  const view = meta.view;
  const base = width / view.width;
  const height = view.height * base;
  const cam = cameraAt(cams, frame / fps, view);
  const tx = width / 2 - cam.x * base * cam.s;
  const ty = height / 2 - cam.y * base * cam.s;
  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative', background: '#f0f2f5' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${cam.s})` }}>
        <ClipFrame file={file} frame={clipFrame} />
        {highlights.map((hl, i) => {
          const t = frame / fps;
          if (t < hl.from - 0.1 || t > hl.to + 0.4) return null;
          const inP = spring({ frame: frame - Math.round(hl.from * fps), fps, config: { damping: 16, stiffness: 140 } });
          const out = interpolate(t, [hl.to, hl.to + 0.35], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const [x, y, w, h] = hl.box;
          const pad = 6;
          const color = hl.color ?? C.blue;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: (x - pad) * base,
                top: (y - pad) * base,
                width: (w + pad * 2) * base,
                height: (h + pad * 2) * base,
                borderRadius: (hl.radius ?? 12) * base,
                border: `${4 / cam.s}px solid ${color}`,
                boxShadow: `0 0 ${24 / cam.s}px ${color}99${hl.dim ? ', 0 0 0 4000px rgba(7,18,43,0.38)' : ''}`,
                opacity: Math.min(inP, out),
                transform: `scale(${1.08 - 0.08 * inP})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

type MagnifierProps = {
  segments: Segment[];
  box: Box;
  x: number; // screen position (top-left), px
  y: number;
  width: number;
  from: number; // scene seconds
  to: number;
  frameOverride?: number; // fixed clip frame (e.g. a moment before a modal covered it)
  clipOverride?: { file: string; view: { width: number; height: number } };
  label?: string;
  accent?: string;
};

/** A floating, rounded close-up of part of the footage, with a soft shadow. */
export const Magnifier: React.FC<MagnifierProps> = ({ segments, box, x, y, width, from, to, frameOverride, clipOverride, label, accent = C.blue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < from || t > to + 0.5) return null;
  const r = resolveSegment(segments, frame, fps);
  const view = clipOverride?.view ?? r.meta.view;
  const file = clipOverride?.file ?? r.file;
  const k = width / box[2];
  const height = box[3] * k;
  const inP = spring({ frame: frame - Math.round(from * fps), fps, config: { damping: 14, stiffness: 120 } });
  const out = interpolate(t, [to, to + 0.35], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const p = Math.min(inP, out);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width, opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.85 + 0.15 * p})`, transformOrigin: 'center' }}>
      {label && (
        <div style={{ position: 'absolute', top: -58, left: 0, background: accent, color: 'white', fontFamily: FONT, fontWeight: 700, fontSize: 32, padding: '6px 18px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', whiteSpace: 'nowrap' }}>
          {label}
        </div>
      )}
      <div style={{ width, height, overflow: 'hidden', borderRadius: 22, border: `4px solid ${accent}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55), 0 0 0 10px rgba(255,255,255,0.08)', position: 'relative', background: 'white' }}>
        <div style={{ position: 'absolute', left: -box[0] * k, top: -box[1] * k, width: view.width * k, height: view.height * k }}>
          <ClipFrame file={file} frame={frameOverride ?? r.clipFrame} />
        </div>
      </div>
    </div>
  );
};
