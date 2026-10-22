import { clip, marker } from './components/Footage';

/** Seconds into a scene at which a clip marker happens, for a segment placed at `at` starting at clip frame `from`. */
export const tm = (clipName: string, key: string, at: number, from = 0, rate = 1) => at + (marker(clipName, key) - from) / rate / 30;

/** Scene-time layout of the connector scene, shared with timeline.ts (voice line starts and scene length). */
export function connectorLayout() {
  const aAt = 8.3; // after the MCP intro graphic
  const aFrom = 45;
  const aRate = 1.4; // the dialog part plays a little faster
  const tabKey = clip('claude').markers.chatgptTab !== undefined ? 'chatgptTab' : 'codeTab';
  const aTo = Math.min(clip('claude').frames - 1, marker('claude', tabKey) + 80);
  const chatAt = aAt + (aTo - aFrom) / aRate / 30;
  const bAt = chatAt + 5.1;
  const bFrom = marker('claude', 'create') - 12;
  const appeared = tm('claude', 'appeared', bAt, bFrom);
  const sameAt = appeared + 2.4;
  return { aAt, aFrom, aRate, aTo, tabKey, chatAt, bAt, bFrom, appeared, sameAt, end: sameAt + 3.0 };
}

