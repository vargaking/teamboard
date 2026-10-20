import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, DISPLAY, FONT, MONO } from '../theme';
import { ClipFrame } from '../components/Footage';
import { Dot, LogoMark, ease } from '../components/UI';

const AVATARS = ['#1677ff', '#fa541c', '#13c2c2', '#722ed1', '#52c41a', '#eb2f96', '#faad14', '#2f54eb', '#a0d911', '#f5222d', '#08979c', '#531dab'];
const LABELS = [C.blue, C.green, C.gold, C.purple, C.red];

/** Stylised kanban card used in motion graphics. */
export const MiniCard: React.FC<{ w: number; seed: number; style?: React.CSSProperties; title?: string; highlight?: string }> = ({ w, seed, style, title, highlight }) => {
  const label = LABELS[seed % LABELS.length];
  const lines = [0.85, 0.55][seed % 2];
  return (
    <div
      style={{
        width: w,
        background: 'white',
        borderRadius: 16,
        padding: 18,
        boxShadow: highlight ? `0 0 0 4px ${highlight}, 0 20px 50px rgba(0,0,0,0.35)` : '0 14px 34px rgba(0,0,0,0.28)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      <div style={{ width: 70 + (seed % 3) * 18, height: 16, borderRadius: 8, background: label }} />
      {title ? (
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: C.ink, lineHeight: 1.15 }}>{title}</div>
      ) : (
        <>
          <div style={{ width: '92%', height: 14, borderRadius: 7, background: '#d6dce6' }} />
          <div style={{ width: `${lines * 100}%`, height: 14, borderRadius: 7, background: '#e4e8ef' }} />
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 74, height: 24, borderRadius: 7, background: seed % 4 === 1 ? '#fff1f0' : '#f1f5f9', border: `2px solid ${seed % 4 === 1 ? '#ffccc7' : '#e2e8f0'}` }} />
        <div style={{ display: 'flex' }}>
          {[0, 1].slice(0, 1 + (seed % 2)).map((k) => (
            <div key={k} style={{ width: 34, height: 34, borderRadius: 17, background: AVATARS[(seed * 3 + k) % 12], border: '3px solid white', marginLeft: k ? -10 : 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
};

/** Animated kanban: three columns of cards drop in, then one card hops from column 1 to column 2. */
export const KanbanArt: React.FC<{ x: number; y: number; scale?: number; delay?: number; hopAt?: number }> = ({ x, y, scale = 1, delay = 0, hopAt = 2.2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colW = 300;
  const titles = ['To do', 'In progress', 'Done'];
  const counts = [3, 2, 2];
  const hop = spring({ frame: frame - Math.round((delay + hopAt) * fps), fps, config: { damping: 13, stiffness: 90 } });
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      {titles.map((t, ci) => {
        const colP = spring({ frame: frame - Math.round((delay + ci * 0.12) * fps), fps, config: { damping: 16 } });
        return (
          <div
            key={t}
            style={{
              position: 'absolute',
              left: ci * (colW + 28),
              top: 0,
              width: colW,
              height: 560,
              borderRadius: 22,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              opacity: colP,
              transform: `translateY(${(1 - colP) * 60}px)`,
            }}
          >
            <div style={{ fontFamily: FONT, color: 'white', fontWeight: 700, fontSize: 32, padding: '18px 22px', display: 'flex', justifyContent: 'space-between' }}>
              {t}
              <span style={{ opacity: 0.6 }}>{counts[ci] + (ci === 0 ? -Math.round(hop) : ci === 1 ? Math.round(hop) : 0)}</span>
            </div>
            {Array.from({ length: counts[ci] }).map((_, k) => {
              const p = spring({ frame: frame - Math.round((delay + 0.25 + ci * 0.15 + k * 0.1) * fps), fps, config: { damping: 14 } });
              const moving = ci === 0 && k === 0;
              const dx = moving ? hop * (colW + 28) : 0;
              const dy = moving ? hop * (counts[1] * 150) + Math.sin(Math.PI * hop) * -60 : 0;
              const shift = ci === 0 && k > 0 ? -hop * 150 : 0;
              return (
                <div key={k} style={{ position: 'absolute', left: 14, top: 76 + k * 150 + shift, opacity: p, transform: `translate(${dx}px, ${dy + (1 - p) * -40}px) rotate(${moving ? Math.sin(Math.PI * hop) * 4 : 0}deg)`, zIndex: moving ? 5 : 1 }}>
                  <MiniCard w={colW - 28} seed={ci * 3 + k} highlight={moving && hop > 0.05 && hop < 0.98 ? C.blue : undefined} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = [
    { text: '12 people.', at: 0.45 },
    { text: '1 project.', at: 1.35 },
    { text: 'Every task in one place.', at: 2.3, accent: true },
  ];
  return (
    <AbsoluteFill>
      <KanbanArt x={1000} y={210} scale={0.95} delay={0.1} hopAt={2.3} />
      <div style={{ position: 'absolute', left: 150, top: 300, fontFamily: DISPLAY, color: 'white' }}>
        {words.map((w) => {
          const p = spring({ frame: frame - Math.round(w.at * fps), fps, config: { damping: 14 } });
          return (
            <div key={w.text} style={{ fontSize: w.accent ? 76 : 110, fontWeight: 800, letterSpacing: -2, lineHeight: 1.12, opacity: p, transform: `translateY(${(1 - p) * 40}px)`, color: w.accent ? C.blueSoft : 'white', maxWidth: 820 }}>
              {w.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const IntroScene: React.FC<{ stillFile: string; stillFrame: number }> = ({ stillFile, stillFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const logo = spring({ frame: frame - 5, fps, config: { damping: 12 } });
  const sub = spring({ frame: frame - 18, fps, config: { damping: 15 } });
  const shot = spring({ frame: frame - 2, fps, config: { damping: 20, stiffness: 60 } });
  const chips = ['Kanban boards', 'Live for all 12 of us', 'Works with Claude'];
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 170,
          width: 1280,
          height: 720,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 60px 140px rgba(0,0,0,0.6)',
          transform: `perspective(2200px) rotateY(-24deg) rotateX(8deg) translateX(${(1 - shot) * 300 + t * -8}px)`,
          opacity: 0.92 * shot,
        }}
      >
        <ClipFrame file={stillFile} frame={stillFrame} />
      </div>
      <div style={{ position: 'absolute', left: 150, top: 290, fontFamily: DISPLAY }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, opacity: logo, transform: `scale(${0.8 + 0.2 * logo})`, transformOrigin: 'left center' }}>
          <LogoMark size={124} />
          <div style={{ color: 'white', fontSize: 132, fontWeight: 800, letterSpacing: -3 }}>TeamBoard</div>
        </div>
        <div style={{ marginTop: 26, color: C.mist, fontSize: 50, fontWeight: 600, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
          The kanban board for Team Lucrum
        </div>
        <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.55)', fontSize: 36, fontWeight: 500, opacity: sub }}>SEP project · TU Eindhoven</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 46 }}>
          {chips.map((c, i) => {
            const p = spring({ frame: frame - Math.round((5.0 + i * 0.25) * fps), fps, config: { damping: 14 } });
            return (
              <div key={c} style={{ fontFamily: FONT, fontSize: 32, fontWeight: 650, color: 'white', padding: '10px 22px', borderRadius: 999, background: 'rgba(22,119,255,0.28)', border: '1px solid rgba(105,167,255,0.6)', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
                {c}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Sparkle: React.FC<{ size: number; color?: string }> = ({ size, color = C.claude }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    {Array.from({ length: 8 }).map((_, i) => (
      <rect key={i} x="29" y="4" width="6" height="26" rx="3" fill={color} transform={`rotate(${i * 45} 32 32)`} />
    ))}
  </svg>
);

/** "TeamBoard <-> Claude" with the MCP link between them. */
export const ClaudeIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - 3, fps, config: { damping: 14 } });
  const b = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const line = ease(frame, 14, 34);
  const pill = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ fontFamily: DISPLAY }}>
      <div style={{ position: 'absolute', left: 300, top: 360, display: 'flex', alignItems: 'center', gap: 28, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <LogoMark size={130} />
        <div style={{ color: 'white', fontSize: 84, fontWeight: 800 }}>TeamBoard</div>
      </div>
      <div style={{ position: 'absolute', left: 1240, top: 360, display: 'flex', alignItems: 'center', gap: 26, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>
        <div style={{ width: 130, height: 130, borderRadius: 34, background: '#2b1d17', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${C.claude}` }}>
          <Sparkle size={86} />
        </div>
        <div style={{ color: 'white', fontSize: 84, fontWeight: 800 }}>Claude</div>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 422, width: 300 * line, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${C.blue}, ${C.claude})` }} />
      <div style={{ position: 'absolute', left: 960, top: 395, transform: `scale(${pill})`, fontFamily: MONO, fontSize: 36, fontWeight: 700, color: 'white', background: '#111a33', border: '2px solid rgba(255,255,255,0.35)', padding: '8px 22px', borderRadius: 14 }}>
        MCP
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 580, textAlign: 'center', color: C.mist, fontSize: 44, fontWeight: 600, opacity: pill }}>
        Your boards, inside your Claude conversations
      </div>
    </AbsoluteFill>
  );
};

/** Stylised (not a claude.ai screenshot) conversation: ask, tool calls, result + what Claude may do. */
export const ClaudeChat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pop = (at: number) => spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 15 } });
  const ask = 'Add a card "Created by Claude" to To do on the Lucrum board.';
  const typed = ask.slice(0, Math.floor(interpolate(t, [0.2, 1.6], [0, ask.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const tools = ['list_boards', 'get_board', 'create_card'];
  const caps = ['Read boards & cards', 'Create & update cards', 'Move cards', 'Add comments'];
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div style={{ position: 'absolute', left: 150, top: 120, width: 1000, height: 760, borderRadius: 28, background: 'rgba(250,247,242,0.97)', boxShadow: '0 50px 120px rgba(0,0,0,0.5)', padding: 44, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#5b4636', fontWeight: 700, fontSize: 32 }}>
          <Sparkle size={40} /> Claude <span style={{ fontWeight: 500, opacity: 0.7 }}>+ TeamBoard connector</span>
        </div>
        <div style={{ alignSelf: 'flex-end', maxWidth: 760, background: '#ede6dc', color: '#2b2118', fontSize: 36, lineHeight: 1.3, padding: '20px 26px', borderRadius: 22, opacity: pop(0.1) }}>
          {typed}
          {typed.length < ask.length && <span style={{ opacity: Math.round(t * 3) % 2 }}>|</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tools.map((tool, i) => {
            const p = pop(1.9 + i * 0.45);
            return (
              <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: p, transform: `translateX(${(1 - p) * -30}px)`, fontSize: 32, color: '#5b4636' }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: C.green, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>✓</div>
                <span style={{ fontFamily: MONO, fontSize: 32, background: 'white', border: '1px solid #e2d8cb', padding: '4px 14px', borderRadius: 10 }}>teamboard · {tool}</span>
              </div>
            );
          })}
        </div>
        <div style={{ maxWidth: 820, color: '#2b2118', fontSize: 36, lineHeight: 1.35, opacity: pop(3.4), transform: `translateY(${(1 - pop(3.4)) * 20}px)` }}>
          Done. <b>Created by Claude</b> is now in <b>To do</b> on <b>Lucrum Backtesting Platform</b>.
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1230, top: 170, width: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ color: 'white', fontSize: 44, fontWeight: 800, opacity: pop(0.6) }}>Claude can</div>
        {caps.map((c, i) => {
          const p = pop(0.9 + i * 0.35);
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'white', fontSize: 36, fontWeight: 600, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
              <Dot color={C.claude} size={18} /> {c}
            </div>
          );
        })}
        <div style={{ marginTop: 20, padding: '18px 24px', borderRadius: 18, background: 'rgba(22,119,255,0.22)', border: '1px solid rgba(105,167,255,0.6)', color: 'white', fontSize: 34, fontWeight: 650, lineHeight: 1.3, opacity: pop(2.6) }}>
          …as you, with your permissions. Only the boards you can see.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Address bar that types the URL. */
export const UrlScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const url = 'teamboard-sep.vercel.app';
  const n = Math.floor(interpolate(t, [0.6, 2.4], [0, url.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const p = spring({ frame, fps, config: { damping: 15 } });
  const enter = spring({ frame: frame - Math.round(3.0 * fps), fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.mist, fontSize: 44, fontWeight: 600, marginBottom: 34, opacity: p }}>Open in any browser</div>
      <div style={{ width: 1260, height: 130, borderRadius: 65, background: 'white', display: 'flex', alignItems: 'center', padding: '0 50px', gap: 26, boxShadow: `0 40px 100px rgba(0,0,0,0.5), 0 0 0 ${8 * enter}px rgba(22,119,255,0.45)`, transform: `scale(${0.9 + 0.1 * p})`, opacity: p }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <div style={{ fontSize: 66, fontWeight: 700, color: C.ink, letterSpacing: -1 }}>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>https://</span>
          {url.slice(0, n)}
          <span style={{ color: C.blue, opacity: n < url.length || Math.round(t * 2.5) % 2 ? 1 : 0 }}>|</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 14 } });
  const q = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const r = spring({ frame: frame - 22, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ fontFamily: DISPLAY, alignItems: 'center', justifyContent: 'center', paddingBottom: 90 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: p, transform: `scale(${0.85 + 0.15 * p})` }}>
        <LogoMark size={120} />
        <div style={{ color: 'white', fontSize: 120, fontWeight: 800, letterSpacing: -3 }}>TeamBoard</div>
      </div>
      <div style={{ marginTop: 40, fontSize: 76, fontWeight: 800, color: 'white', padding: '14px 46px', borderRadius: 26, background: C.blue, boxShadow: '0 30px 80px rgba(22,119,255,0.45)', opacity: q, transform: `translateY(${(1 - q) * 30}px)` }}>
        teamboard-sep.vercel.app
      </div>
      <div style={{ marginTop: 46, display: 'flex', gap: 30, fontFamily: FONT, opacity: r, transform: `translateY(${(1 - r) * 20}px)` }}>
        {[
          ['Log in', 'firstname@teamboard.local'],
          ['Then', 'Avatar menu → Change password'],
        ].map(([k, v]) => (
          <div key={k} style={{ padding: '16px 28px', borderRadius: 18, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)', color: 'white', fontSize: 36, fontWeight: 600 }}>
            <span style={{ color: C.blueSoft, fontWeight: 800 }}>{k}: </span>
            {v}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
