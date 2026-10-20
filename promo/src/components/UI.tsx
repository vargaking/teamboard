import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_LINES, SCENES, TOTAL_SECONDS } from '../timeline';
import { C, FONT, MONO } from '../theme';

export const ease = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const useSpring = (delaySec = 0, config = { damping: 15, stiffness: 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - Math.round(delaySec * fps), fps, config });
};

/** Deep-navy background with slowly drifting light blobs and a faint dot grid. Rendered once for the whole video. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (x: number, y: number, r: number, color: string, phase: number) => (
    <div
      style={{
        position: 'absolute',
        left: x + Math.sin(t * 0.25 + phase) * 120,
        top: y + Math.cos(t * 0.2 + phase) * 90,
        width: r,
        height: r,
        borderRadius: '50%',
        background: color,
        filter: 'blur(140px)',
        opacity: 0.55,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 20% 10%, ${C.navy2} 0%, ${C.navy} 60%, #040a1a 100%)`, overflow: 'hidden' }}>
      {blob(-200, -150, 900, '#1d4ed8', 0)}
      {blob(1250, 500, 800, '#1677ff', 2)}
      {blob(600, 800, 700, '#3b1fa8', 4)}
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1.4px, transparent 1.6px)',
          backgroundSize: '36px 36px',
          backgroundPosition: `${(t * 6) % 36}px ${(t * 4) % 36}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const LogoMark: React.FC<{ size: number; color?: string }> = ({ size, color = C.blue }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <rect x="2" y="2" width="60" height="60" rx="16" fill={color} />
    <rect x="13" y="14" width="10" height="34" rx="4" fill="white" />
    <rect x="27" y="14" width="10" height="24" rx="4" fill="white" opacity="0.9" />
    <rect x="41" y="14" width="10" height="16" rx="4" fill="white" opacity="0.8" />
  </svg>
);

/** A browser window that frames captured footage. */
export const BrowserWindow: React.FC<{
  x: number;
  y: number;
  width: number;
  contentHeight: number;
  url?: string;
  dark?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, width, contentHeight, url, dark, children, style }) => {
  const bar = 46;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: contentHeight + bar,
        borderRadius: 18,
        overflow: 'hidden',
        background: dark ? '#141414' : '#ffffff',
        boxShadow: '0 50px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)',
        ...style,
      }}
    >
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: dark ? '#1f1f1f' : '#eef1f6' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
        ))}
      </div>
      <div style={{ position: 'relative', width, height: contentHeight }}>{children}</div>
    </div>
  );
};

/** Section chip at the top: "2 / 7" + feature name. */
export const SceneChip: React.FC<{ index: number; total: number; title: string; x?: number; y?: number }> = ({ index, total, title, x = 200, y = 22 }) => {
  const p = useSpring(0.1);
  return (
    <div style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 16, opacity: p, transform: `translateX(${(1 - p) * -40}px)`, fontFamily: FONT }}>
      <div style={{ background: C.blue, color: 'white', fontWeight: 800, fontSize: 30, padding: '4px 14px', borderRadius: 10, letterSpacing: 1 }}>
        {String(index).padStart(2, '0')}
        <span style={{ opacity: 0.7, fontWeight: 600 }}> / {String(total).padStart(2, '0')}</span>
      </div>
      <div style={{ color: 'white', fontWeight: 750, fontSize: 40, letterSpacing: -0.5, textShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{title}</div>
    </div>
  );
};

/** Thin progress bar along the top edge with a tick per scene. */
export const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const p = Math.min(1, t / TOTAL_SECONDS);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 7, background: 'rgba(255,255,255,0.08)' }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.blueSoft}, ${C.blue})`, boxShadow: `0 0 16px ${C.blue}` }} />
      {SCENES.slice(1).map((s) => (
        <div key={s.id} style={{ position: 'absolute', top: 0, left: `${(s.start / TOTAL_SECONDS) * 100}%`, width: 3, height: 7, background: 'rgba(7,18,43,0.9)' }} />
      ))}
    </div>
  );
};

/** Burned-in captions, always on, synchronised with the voice-over lines. */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const line = ALL_LINES.find((l) => t >= l.start - 0.08 && t <= l.end + 0.35);
  if (!line) return null;
  const inP = ease(t, line.start - 0.08, line.start + 0.12);
  const out = ease(t, line.end + 0.15, line.end + 0.35, 1, 0);
  const o = Math.min(inP, out);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          maxWidth: 1560,
          padding: '14px 34px 16px',
          borderRadius: 18,
          background: 'rgba(5,12,30,0.86)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          color: 'white',
          fontFamily: FONT,
          fontSize: 40,
          lineHeight: 1.3,
          fontWeight: 600,
          textAlign: 'center',
          opacity: o,
          transform: `translateY(${(1 - o) * 14}px)`,
        }}
      >
        {line.text}
      </div>
    </div>
  );
};

/** A pill label that pops in, optionally with a line to a point. */
export const Callout: React.FC<{
  x: number;
  y: number;
  text: string;
  from: number;
  to: number;
  color?: string;
  icon?: React.ReactNode;
  pointTo?: { x: number; y: number };
  align?: 'left' | 'right';
  size?: number;
}> = ({ x, y, text, from, to, color = C.blue, icon, pointTo, align = 'left', size = 34 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < from - 0.05 || t > to + 0.5) return null;
  const inP = spring({ frame: frame - Math.round(from * fps), fps, config: { damping: 13, stiffness: 140 } });
  const out = ease(t, to, to + 0.3, 1, 0);
  const o = Math.min(inP, out);
  return (
    <>
      {pointTo && (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'visible', opacity: o }}>
          <line x1={x} y1={y} x2={x + (pointTo.x - x) * inP} y2={y + (pointTo.y - y) * inP} stroke={color} strokeWidth={4} strokeLinecap="round" />
          <circle cx={pointTo.x} cy={pointTo.y} r={9 * inP} fill={color} stroke="white" strokeWidth={3} />
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: align === 'left' ? x : undefined,
          right: align === 'right' ? 1920 - x : undefined,
          top: y,
          transform: `translateY(-50%) scale(${0.7 + 0.3 * o})`,
          transformOrigin: align === 'left' ? 'left center' : 'right center',
          opacity: o,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'white',
          color: C.ink,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: size,
          padding: '10px 22px 10px 16px',
          borderRadius: 16,
          boxShadow: '0 18px 40px rgba(0,0,0,0.4)',
          borderLeft: `8px solid ${color}`,
          whiteSpace: 'nowrap',
        }}
      >
        {icon}
        {text}
      </div>
    </>
  );
};

export const Pulse: React.FC<{ x: number; y: number; from: number; color?: string; size?: number }> = ({ x, y, from, color = C.green, size = 60 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30 - from;
  if (t < 0 || t > 3) return null;
  return (
    <>
      {[0, 0.5, 1].map((d) => {
        const p = ((t + d) % 1.2) / 1.2;
        return (
          <div
            key={d}
            style={{
              position: 'absolute',
              left: x - (size * (0.4 + p)) / 2,
              top: y - (size * (0.4 + p)) / 2,
              width: size * (0.4 + p),
              height: size * (0.4 + p),
              borderRadius: '50%',
              border: `4px solid ${color}`,
              opacity: (1 - p) * ease(t, 2.4, 3, 1, 0),
            }}
          />
        );
      })}
    </>
  );
};

export const Mono: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontFamily: MONO, ...style }}>{children}</span>
);

export const EyeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 30, color = C.ink }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const Dot: React.FC<{ color: string; size?: number }> = ({ color, size = 16 }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: color, flex: 'none' }} />
);
