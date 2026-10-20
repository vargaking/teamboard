// Print scene start/end times: npx tsx scripts/timeline.ts
import { SCENES, TOTAL_SECONDS } from '../src/timeline';
for (const s of SCENES) console.log(`${s.id.padEnd(8)} ${s.start.toFixed(2).padStart(7)}s  frame ${String(Math.round(s.start * 30)).padStart(5)}  len ${s.seconds.toFixed(2)}s`);
console.log(`total ${TOTAL_SECONDS.toFixed(2)}s`);
