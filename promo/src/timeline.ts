import voice from './data/voice.json';
import { FPS } from './theme';

/**
 * Scene timing. Every scene's length is driven by its voice-over lines (from audio/make_voice.py -> data/voice.json)
 * and by the footage it shows. `lineStarts` pins a line to a moment in the scene (seconds) so that what is said
 * matches what is on screen; a line never starts before the previous one has finished plus GAP.
 */
export type SceneId = 'hook' | 'intro' | 'boards' | 'live' | 'details' | 'filters' | 'claude' | 'import' | 'login';

type SceneConfig = { id: SceneId; title?: string; seconds: number; lineStarts: number[] };

export const SCENE_CONFIG: SceneConfig[] = [
  { id: 'hook', seconds: 5.0, lineStarts: [0.5] },
  { id: 'intro', title: 'Meet TeamBoard', seconds: 7.6, lineStarts: [0.4, 5.2] },
  { id: 'boards', title: 'Boards & cards', seconds: 15.0, lineStarts: [0.4, 4.3, 9.4] },
  { id: 'live', title: 'Live updates', seconds: 10.6, lineStarts: [0.4, 2.6, 7.0] },
  { id: 'details', title: 'Card details', seconds: 11.4, lineStarts: [0.6, 5.3] },
  { id: 'filters', title: 'Filters, menus & dark mode', seconds: 14.4, lineStarts: [0.4, 7.2, 11.0] },
  { id: 'claude', title: 'Claude connector', seconds: 18.6, lineStarts: [0.4, 2.8, 9.4, 14.6] },
  { id: 'import', title: 'Trello import & team', seconds: 13.6, lineStarts: [0.5, 7.6] },
  { id: 'login', title: 'Get started', seconds: 16.0, lineStarts: [0.5, 5.2, 12.3] },
];

const GAP = 0.25;
const TAIL = 0.6;

export type Line = { file: string; text: string; start: number; end: number }; // seconds, absolute
export type Scene = SceneConfig & { start: number; end: number; lines: Line[]; index: number };

function build(): Scene[] {
  const out: Scene[] = [];
  let t = 0;
  SCENE_CONFIG.forEach((cfg, index) => {
    const v = voice.scenes.find((s) => s.id === cfg.id);
    if (!v) throw new Error(`voice.json has no scene ${cfg.id}`);
    let cursor = 0;
    const lines: Line[] = v.lines.map((l, i) => {
      const start = Math.max(cfg.lineStarts[i] ?? cursor + GAP, i === 0 ? 0 : cursor + GAP);
      cursor = start + l.seconds;
      return { file: l.file, text: l.text, start: t + start, end: t + cursor };
    });
    const seconds = Math.max(cfg.seconds, cursor + TAIL);
    out.push({ ...cfg, seconds, start: t, end: t + seconds, lines, index });
    t += seconds;
  });
  return out;
}

export const SCENES = build();
export const TOTAL_SECONDS = SCENES[SCENES.length - 1].end;
export const TOTAL_FRAMES = Math.round(TOTAL_SECONDS * FPS);
export const ALL_LINES = SCENES.flatMap((s) => s.lines);

export const sceneById = (id: SceneId) => SCENES.find((s) => s.id === id)!;
export const sec = (s: number) => Math.round(s * FPS);
