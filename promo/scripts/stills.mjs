// Render key frames as PNGs: node scripts/stills.mjs <outDir> <frame> [frame...]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const [outDir, ...frames] = process.argv.slice(2);
const browserExecutable = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'TeamBoardPromo', browserExecutable });
console.log(`duration ${composition.durationInFrames} frames = ${(composition.durationInFrames / 30).toFixed(1)} s`);
for (const f of frames) {
  const frame = Math.min(Number(f), composition.durationInFrames - 1);
  const output = path.join(outDir, `frame-${String(frame).padStart(4, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output, browserExecutable, imageFormat: 'png' });
  console.log(output);
}
