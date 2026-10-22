import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Box, Cam, Footage, Highlight, Magnifier, Segment, boxOf, cameraAt, clip, focus, marker, project } from '../components/Footage';
import { BrowserWindow, Callout, EyeIcon, Pulse } from '../components/UI';
import { C, FONT } from '../theme';
import { ClaudeChat, ClaudeIntro, EndCard, UrlScene } from './Graphics';

// Main footage window: 1440 px wide content (= 1:1 with the 1440 CSS px capture viewport, rendered from 2560 px video).
export const WIN = { x: 240, y: 86, w: 1440, bar: 46 };
const MAIN_VIEW = { width: 1440, height: 810 };
const winH = (WIN.w * MAIN_VIEW.height) / MAIN_VIEW.width;

/** Seconds into the scene at which a clip marker happens, for a segment placed at `at` starting at `from`. */
const tm = (clipName: string, key: string, at: number, from = 0, rate = 1) => at + (marker(clipName, key) - from) / rate / 30;

/** Screen position of a CSS point of the main footage at scene time t. */
function toScreen(cams: Cam[], t: number, x: number, y: number) {
  const cam = cameraAt(cams, t, MAIN_VIEW);
  const p = project(cam, WIN.w / MAIN_VIEW.width, WIN.w, winH, x, y);
  return { x: WIN.x + p.x, y: WIN.y + WIN.bar + p.y };
}
const pad = (b: Box, px: number, py = px): Box => [b[0] - px, b[1] - py, b[2] + 2 * px, b[3] + 2 * py];

const MainWindow: React.FC<{ segments: Segment[]; cams?: Cam[]; highlights?: Highlight[]; dark?: boolean }> = ({ segments, cams, highlights, dark }) => (
  <BrowserWindow x={WIN.x} y={WIN.y} width={WIN.w} contentHeight={winH} dark={dark}>
    <Footage segments={segments} width={WIN.w} cams={cams} highlights={highlights} />
  </BrowserWindow>
);

// ---------------------------------------------------------------------------------------------------------------
export const BoardsScene: React.FC = () => {
  const dragAt = 8.0;
  const segments: Segment[] = [{ clip: 'boards', at: 0 }, { clip: 'drag', at: dragAt }];
  const click = tm('boards', 'click', 0);
  const grab = tm('drag', 'grab', dragAt);
  const drop = tm('drag', 'drop', dragAt);
  const tile = boxOf('boards', 'lucrumTile');
  const sharpe = boxOf('drag', 'sharpeCard');
  const src = boxOf('drag', 'source');
  const review = boxOf('drag', 'review');
  const moved = boxOf('drag', 'moved');
  const midX = (src[0] + review[0] + review[2]) / 2;
  const cams: Cam[] = [
    { t: 0, s: 1.0 },
    { t: 1.2, s: 1.12, x: 640, y: 300 },
    { ...focus(click - 0.3, pad(tile, 120, 80), MAIN_VIEW, 0.5, 1.5), t: click - 0.3 },
    { t: click + 0.6, s: 1 },
    { t: grab - 0.7, s: 1 },
    { t: grab + 0.2, s: 1.4, x: midX, y: 330 },
    { t: drop + 1.2, s: 1.4, x: midX, y: 330 },
    { t: drop + 2.2, s: 1.15, x: midX + 60, y: 380 },
  ];
  const magFrom = 4.9;
  const magTo = 9.0;
  const MX = 1090;
  const MY = 300;
  const MW = 740;
  const MH = (sharpe[3] / sharpe[2]) * MW;
  const at = (fx: number, fy: number) => ({ x: MX + fx * MW, y: MY + fy * MH });
  return (
    <AbsoluteFill>
      <MainWindow
        segments={segments}
        cams={cams}
        highlights={[
          { box: sharpe, from: magFrom, to: magTo, dim: true },
          { box: moved, from: drop + 0.3, to: 14.6, color: C.green },
        ]}
      />
      <Magnifier segments={segments} box={pad(sharpe, 10, 6)} x={MX} y={MY} width={MW} from={magFrom} to={magTo} />
      <Callout x={MX + 40} y={MY - 70} text="Labels" from={magFrom + 0.5} to={magTo} pointTo={at(0.12, 0.17)} />
      <Callout x={MX} y={MY + MH + 80} text="Due date" from={magFrom + 1.0} to={magTo} color={C.orange} pointTo={at(0.14, 0.83)} />
      <Callout x={at(0.5, 1).x - 110} y={MY + MH + 170} text="Reviewers" icon={<EyeIcon />} from={magFrom + 1.5} to={magTo} color={C.purple} pointTo={at(0.55, 0.83)} />
      <Callout x={MX + MW} y={MY + MH + 80} align="right" text="Assignee" from={magFrom + 2.0} to={magTo} color={C.green} pointTo={at(0.92, 0.83)} />
      <Callout x={1680} y={47} align="right" text="Drag & drop" from={grab} to={drop + 1.8} size={38} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const LiveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const at = 0.8;
  const view = clip('live').view;
  const W = 880;
  const H = (W * view.height) / view.width;
  const y = 190;
  const left = { x: 60, file: 'live-miki' };
  const right = { x: 980, file: 'live-daniel' };
  const synced = tm('live', 'synced', at);
  const drop = tm('live', 'drop', at);
  const dot = boxOf('live', 'liveDot');
  const card = boxOf('live', 'syncedCard');
  const zoomAt = 6.9;
  const rightCams: Cam[] = [
    { t: 0, s: 1 },
    { t: zoomAt, s: 1 },
    { t: zoomAt + 0.7, x: 330, y: 150, s: 1.8 },
  ].map((k, i) => (i === 2 ? { ...k, t: zoomAt + 0.7 } : k));
  const segL: Segment[] = [{ clip: 'live', file: left.file, at }];
  const segR: Segment[] = [{ clip: 'live', file: right.file, at }];
  const camNow = cameraAt(rightCams, t, view);
  const dotScreen = project(camNow, W / view.width, W, H, dot[0] + 10, dot[1] + dot[3] / 2);
  const label = (x: number, text: string, color: string, initials: string) => (
    <div style={{ position: 'absolute', left: x, top: y - 70, display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT, color: 'white', fontSize: 36, fontWeight: 700 }}>
      <div style={{ width: 48, height: 48, borderRadius: 24, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{initials}</div>
      {text}
    </div>
  );
  return (
    <AbsoluteFill>
      {label(left.x, "Miki's laptop", '#fa541c', 'MP')}
      {label(right.x, 'Your screen', C.blue, 'DG')}
      <BrowserWindow x={left.x} y={y} width={W} contentHeight={H}>
        <Footage segments={segL} width={W} />
      </BrowserWindow>
      <BrowserWindow x={right.x} y={y} width={W} contentHeight={H} style={{ boxShadow: t > synced ? `0 0 0 5px ${C.green}, 0 50px 120px rgba(0,0,0,0.55)` : undefined }}>
        <Footage segments={segR} width={W} cams={rightCams} highlights={[{ box: card, from: synced, to: zoomAt, color: C.green }]} />
      </BrowserWindow>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }}>
        {t > drop - 0.2 && t < synced + 1.5 && (
          <path d="M 940 560 L 1000 560" stroke={C.green} strokeWidth="8" strokeLinecap="round" opacity={Math.min(1, (t - drop + 0.2) * 3)} />
        )}
      </svg>
      <Callout x={960} y={y + H + 110} text="Synced in real time" from={synced} to={zoomAt - 0.2} color={C.green} size={38} align="left" />
      {t > zoomAt + 0.6 && <Pulse x={right.x + dotScreen.x} y={y + 46 + dotScreen.y} from={zoomAt + 0.7} color={C.green} size={90} />}
      <Callout x={right.x + 40} y={y + H + 110} text="Live = connected and in sync" from={zoomAt + 0.8} to={10.4} color={C.green} size={38} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const DetailsScene: React.FC = () => {
  const segments: Segment[] = [{ clip: 'details', at: 0 }];
  const opened = tm('details', 'opened', 0);
  const sent = tm('details', 'sent', 0);
  const modal = boxOf('details', 'modal');
  const modalAfter = boxOf('details', 'modalAfter');
  const tile = boxOf('details', 'tile');
  const assignees = boxOf('details', 'assignees');
  const people = boxOf('details', 'people');
  const newComment = boxOf('details', 'newComment');
  const scrollT = tm('details', 'reviewers', 0) + 1.9;
  const cams: Cam[] = [
    { t: 0, s: 1 },
    { t: 1.3, ...focus(0, pad(tile, 160, 120), MAIN_VIEW, 0.45, 1.5) },
    { t: opened, ...focus(0, pad(modal, 30, 0), MAIN_VIEW, 0.62, 1.6), y: modal[1] + 330 },
    { t: scrollT, ...focus(0, pad(modal, 30, 0), MAIN_VIEW, 0.62, 1.6), y: modal[1] + 330 },
    { t: scrollT + 0.8, ...focus(0, pad(modalAfter, 30, 0), MAIN_VIEW, 0.62, 1.6), y: Math.max(405, modalAfter[1] + modalAfter[3] - 330) },
  ].map((k, i) => ({ ...k, t: [0, 1.3, opened, scrollT, scrollT + 0.8][i] }));
  const MX = 1090;
  const MY = 250;
  const MW = 620;
  const MH = (tile[3] / tile[2]) * MW;
  const atM = (fx: number, fy: number) => ({ x: MX + fx * MW, y: MY + fy * MH });
  const magFrom = 5.4;
  const magTo = 8.6;
  return (
    <AbsoluteFill>
      <MainWindow
        segments={segments}
        cams={cams}
        highlights={[
          { box: assignees, from: 2.9, to: 4.6, color: C.green },
          { box: people, from: magFrom, to: Math.min(magTo, scrollT + 0.1), color: C.purple },
          { box: newComment, from: sent + 0.2, to: 11.4, color: C.blue },
        ]}
      />
      <Callout x={1680} y={47} align="right" text="Assignees" from={2.9} to={4.7} color={C.green} />
      <Magnifier segments={segments} box={pad(tile, 4)} x={MX} y={MY} width={MW} from={magFrom} to={magTo} frameOverride={20} label="On the card" accent={C.purple} />
      <Callout x={MX - 24} y={atM(0.12, 0.17).y} align="right" text="Labels" from={magFrom + 1.6} to={magTo} pointTo={atM(0.12, 0.17)} />
      <Callout x={atM(0.55, 1).x - 140} y={MY + MH + 90} text="Reviewer" icon={<EyeIcon />} from={magFrom + 0.4} to={magTo} color={C.purple} pointTo={atM(0.6, 0.84)} />
      <Callout x={1680} y={47} align="right" text="Comments" from={sent} to={11.4} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const ReviewsScene: React.FC = () => {
  const segments: Segment[] = [{ clip: 'reviews', at: 0 }];
  const at = (k: string) => tm('reviews', k, 0);
  const panel = boxOf('reviews', 'panel');
  const rowDaniel = boxOf('reviews', 'rowDaniel');
  const footer = boxOf('reviews', 'footer');
  const moved = boxOf('reviews', 'moved');
  const top: Box = [panel[0], panel[1], panel[2], rowDaniel[1] - panel[1] + 3 * rowDaniel[3] + 6]; // header + first three rows
  const cams: Cam[] = [
    { t: 0, s: 1 },
    { t: 1.0, s: 1.25, x: 560, y: 380 },
    { t: at('open') - 0.2, s: 1.25, x: 560, y: 380 },
    { t: at('open') + 0.6, s: 1 },
    { t: at('closed') + 0.2, s: 1 },
  ];
  const MX = 1200;
  const MW = 470;
  const magTop = { y: 250, h: (top[3] / top[2]) * MW };
  const footY = magTop.y + magTop.h + 70;
  return (
    <AbsoluteFill>
      <BrowserWindow x={WIN.x} y={WIN.y} width={WIN.w} contentHeight={winH}>
        <Footage
          segments={segments}
          width={WIN.w}
          cams={cams}
          highlights={[
            { box: panel, from: 0.6, to: at('open') - 0.2, color: C.blue },
            { box: moved, from: at('drop') + 0.2, to: at('filter') - 0.2, color: C.green },
            { box: rowDaniel, from: at('filter') - 0.1, to: 13.9, color: C.purple },
          ]}
        />
      </BrowserWindow>
      <Magnifier segments={segments} box={top} x={MX} y={magTop.y} width={MW} from={at('closed') + 0.3} to={13.6} label="Live per reviewer" />
      <Magnifier segments={segments} box={pad(footer, 0, 2)} x={MX} y={footY} width={MW} from={at('drop') + 0.3} to={13.6} accent={C.green} />
      <Callout x={1680} y={47} align="right" text="Add a reviewer in the card" from={at('open')} to={at('closed')} color={C.purple} />
      <Callout x={1680} y={47} align="right" text="Card done → count ticks over live" from={at('drop') - 0.2} to={at('filter') - 0.5} color={C.green} />
      <Callout x={1680} y={47} align="right" text="Click a row: filter by reviewer" from={at('filter')} to={13.9} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const FiltersScene: React.FC = () => {
  const aFrom = 40;
  const aTo = 300;
  const aRate = 1.6;
  const bAt = (aTo - aFrom) / aRate / 30;
  const bFrom = 380;
  const bTo = 445;
  const cAt = bAt + (bTo - bFrom) / 30;
  const cFrom = 15;
  const cTo = 125;
  const dAt = cAt + (cTo - cFrom) / 30;
  const segments: Segment[] = [
    { clip: 'filters', at: 0, from: aFrom, to: aTo, rate: aRate },
    { clip: 'filters', at: bAt, from: bFrom, to: bTo },
    { clip: 'context', at: cAt, from: cFrom, to: cTo },
    { clip: 'dark', at: dAt, from: 10 },
  ];
  const cardMenu = boxOf('context', 'cardMenu');
  const toggle = boxOf('dark', 'toggle');
  const toggleT = tm('dark', 'toggle', dAt, 10);
  const assigneeT = tm('filters', 'assignee', 0, aFrom, aRate);
  const reviewerT = tm('filters', 'reviewer', 0, aFrom, aRate);
  const cams: Cam[] = [
    { t: 0, s: 1.45, x: 470, y: 290 },
    { t: bAt - 0.01, s: 1.45, x: 470, y: 290 },
    { t: bAt, s: 1.45, x: 560, y: 300 },
    { t: cAt - 0.01, s: 1.45, x: 560, y: 300 },
    { t: cAt, s: 1.0 },
    { t: cAt + 0.9, ...focus(0, pad(cardMenu, 260, 120), MAIN_VIEW, 0.6, 1.6) },
    { t: dAt - 0.01, ...focus(0, pad(cardMenu, 260, 120), MAIN_VIEW, 0.6, 1.6) },
    { t: dAt, s: 1.5, x: 1100, y: 250 },
    { t: toggleT + 0.3, s: 1.5, x: 1100, y: 250 },
    { t: toggleT + 1.4, s: 1.0 },
  ].map((k) => ({ ...k, t: k.t }));
  const frame = useCurrentFrame();
  const dark = frame / 30 > toggleT + 0.1;
  return (
    <AbsoluteFill>
      <MainWindow segments={segments} cams={cams} dark={dark} highlights={[{ box: toggle, from: toggleT - 0.6, to: toggleT + 0.6, color: C.gold }]} />
      <Callout x={1680} y={47} align="right" text="Assigned to me" from={assigneeT} to={reviewerT - 0.4} />
      <Callout x={1680} y={47} align="right" text="Reviewed by me" from={reviewerT} to={bAt - 0.1} color={C.purple} />
      <Callout x={1680} y={47} align="right" text="Search" from={bAt + 0.2} to={cAt - 0.1} color={C.green} />
      <Callout x={1680} y={47} align="right" text="Right-click menus" from={cAt + 0.4} to={dAt - 0.1} color={C.orange} />
      <Callout x={1680} y={47} align="right" text="Dark mode" from={toggleT} to={15} color={C.gold} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const ClaudeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const aAt = 2.7;
  const aFrom = 30;
  const aTo = 250;
  const chatAt = aAt + (aTo - aFrom) / 30;
  const bAt = chatAt + 5.1;
  const bFrom = marker('claude', 'create') - 12;
  const segments: Segment[] = [
    { clip: 'claude', at: aAt, from: aFrom, to: aTo },
    { clip: 'claude', at: bAt, from: bFrom },
  ];
  const menu = boxOf('claude', 'menu');
  const dialog = boxOf('claude', 'dialog');
  const newCard = boxOf('claude', 'newCard');
  const menuT = tm('claude', 'menu', aAt, aFrom);
  const dialogT = tm('claude', 'dialog', aAt, aFrom);
  const appeared = tm('claude', 'appeared', bAt, bFrom);
  const cams: Cam[] = [
    { t: aAt, s: 1 },
    { t: menuT - 0.6, ...focus(0, pad(menu, 120, 60), MAIN_VIEW, 0.45, 1.8) },
    { t: dialogT, ...focus(0, pad(menu, 120, 60), MAIN_VIEW, 0.45, 1.8) },
    { t: dialogT + 0.6, ...focus(0, pad(dialog, 20, 10), MAIN_VIEW, 0.7, 1.6) },
    { t: bAt - 0.01, ...focus(0, pad(dialog, 20, 10), MAIN_VIEW, 0.7, 1.6) },
    { t: bAt, s: 1 },
    { t: appeared + 0.1, s: 1 },
    { t: appeared + 0.9, ...focus(0, pad(newCard, 200, 160), MAIN_VIEW, 0.5, 1.7) },
  ].map((k, i) => ({ ...k, t: [aAt, menuT - 0.6, dialogT, dialogT + 0.6, bAt - 0.01, bAt, appeared + 0.1, appeared + 0.9][i] }));
  const cardScreen = toScreen(cams, t, newCard[0] + newCard[2], newCard[1] + newCard[3] / 2);
  const showWindow = (t >= aAt && t < chatAt) || t >= bAt;
  return (
    <AbsoluteFill>
      {t < aAt + 0.1 && <ClaudeIntroFade until={aAt} />}
      {showWindow && <MainWindow segments={segments} cams={cams} highlights={[{ box: newCard, from: appeared + 0.1, to: 18.6, color: C.claude }]} />}
      {t >= chatAt && t < bAt && <ClaudeChatSeq at={chatAt} />}
      <Callout x={1680} y={47} align="right" text="Avatar menu → Connect to Claude" from={menuT - 0.4} to={dialogT + 0.6} color={C.claude} />
      <Callout x={1680} y={47} align="right" text="claude.ai or Claude Code" from={dialogT + 1.0} to={chatAt - 0.2} color={C.claude} />
      {t > appeared + 1.0 && <Callout x={cardScreen.x + 60} y={cardScreen.y} text="Created by Claude, live" from={appeared + 1.0} to={18.6} color={C.claude} pointTo={{ x: cardScreen.x + 4, y: cardScreen.y }} />}
    </AbsoluteFill>
  );
};

const ClaudeIntroFade: React.FC<{ until: number }> = () => <ClaudeIntro />;

const ClaudeChatSeq: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <ShiftFrame by={Math.round(at * 30)} frame={frame}>
        <ClaudeChat />
      </ShiftFrame>
    </AbsoluteFill>
  );
};

/** Render children as if the scene started `by` frames later. */
const ShiftFrame: React.FC<{ by: number; frame: number; children: React.ReactNode }> = ({ by, children }) => (
  <Sequence from={by} layout="none">
    {children}
  </Sequence>
);

// ---------------------------------------------------------------------------------------------------------------
export const ImportScene: React.FC = () => {
  const teamAt = 7.4;
  const tFrom = 20;
  const tEnd = Math.min(clip('trello').frames - 1, marker('trello', 'imported') + 45);
  const tRate = (tEnd - tFrom) / ((teamAt - 0.1) * 30);
  const teamFrom = Math.max(0, marker('team', 'invite') - 20);
  const segments: Segment[] = [
    { clip: 'trello', at: 0, from: tFrom, to: tEnd, rate: Math.max(1, tRate) },
    { clip: 'team', at: teamAt, from: teamFrom },
  ];
  const rate = Math.max(1, tRate);
  const preview = tm('trello', 'preview', 0, tFrom, rate);
  const imported = tm('trello', 'imported', 0, tFrom, rate);
  const modal = boxOf('trello', 'modal');
  const inviteModal = boxOf('team', 'inviteModal');
  const created = tm('team', 'create', teamAt, teamFrom);
  const cams: Cam[] = [
    { t: 0, s: 1 },
    { t: 1.0, s: 1.25, x: 640, y: 300 },
    { t: preview + 0.3, ...focus(0, pad(modal, 20, 0), MAIN_VIEW, 0.62, 1.5), y: modal[1] + 280 },
    { t: imported - 0.4, ...focus(0, pad(modal, 20, 0), MAIN_VIEW, 0.62, 1.5), y: modal[1] + 470 },
    { t: imported + 0.4, s: 1 },
    { t: teamAt - 0.01, s: 1 },
    { t: teamAt, s: 1.1, x: 640, y: 400 },
    { t: created - 0.5, ...focus(0, pad(inviteModal, 60, 160), MAIN_VIEW, 0.5, 1.6) },
  ].map((k, i) => ({ ...k, t: [0, 1.0, preview + 0.3, imported - 0.4, imported + 0.4, teamAt - 0.01, teamAt, created - 0.5][i] }));
  return (
    <AbsoluteFill>
      <MainWindow segments={segments} cams={cams} />
      <Callout x={1680} y={47} align="right" text="Import from Trello" from={0.4} to={preview - 0.2} color={C.blue} />
      <Callout x={1680} y={47} align="right" text="Lists · cards · labels · comments" from={preview + 0.2} to={teamAt - 0.5} color={C.blue} />
      <Callout x={1680} y={47} align="right" text="Team page: add users" from={teamAt + 0.3} to={created - 0.6} color={C.green} />
      <Callout x={1680} y={47} align="right" text="Invite link" from={created + 0.2} to={14.5} color={C.green} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------------------------
export const LoginScene: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const loginAt = 5.0;
  const from = 20;
  const rate = 1.1;
  const endCardAt = 12.1;
  const segments: Segment[] = [{ clip: 'login', at: loginAt, from, rate }];
  const form = boxOf('login', 'form');
  const modal = boxOf('login', 'modal');
  const menuT = tm('login', 'menu', loginAt, from, rate);
  const loginT = tm('login', 'login', loginAt, from, rate);
  const cams: Cam[] = [
    { t: loginAt, ...focus(0, pad(form, 80, 40), MAIN_VIEW, 0.5, 1.7) },
    { t: loginT + 0.2, ...focus(0, pad(form, 80, 40), MAIN_VIEW, 0.5, 1.7) },
    { t: loginT + 0.9, s: 1 },
    { t: menuT - 0.9, s: 1 },
    { t: menuT, s: 1.6, x: 1200, y: 200 },
    { t: menuT + 0.9, ...focus(0, pad(modal, 40, 30), MAIN_VIEW, 0.55, 1.6) },
  ].map((k, i) => ({ ...k, t: [loginAt, loginT + 0.2, loginT + 0.9, menuT - 0.9, menuT, menuT + 0.9][i] }));
  return (
    <AbsoluteFill>
      {t < loginAt && <UrlScene />}
      {t >= loginAt && t < endCardAt && <MainWindow segments={segments} cams={cams} />}
      {t >= loginAt && t < endCardAt && (
        <>
          <Callout x={1680} y={47} align="right" text="firstname@teamboard.local" from={loginAt + 0.5} to={loginT + 0.3} color={C.blue} />
          <Callout x={1680} y={47} align="right" text="Avatar menu → Change password" from={menuT - 0.2} to={endCardAt - 0.1} color={C.gold} />
        </>
      )}
      {t >= endCardAt && (
        <Sequence from={Math.round(endCardAt * 30)} layout="none">
          <EndCard />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

