import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Background, Captions, ProgressBar, SceneChip } from './components/UI';
import { ALL_LINES, SCENES, SceneId, TOTAL_SECONDS } from './timeline';
import { FPS } from './theme';
import { HookScene, IntroScene } from './scenes/Graphics';
import { BoardsScene, ClaudeScene, DetailsScene, FiltersScene, ImportScene, LiveScene, LoginScene, ReviewsScene } from './scenes/Features';
import { clip } from './components/Footage';

const FADE = 8; // frames of crossfade between scenes

const SCENE_COMPONENTS: Record<SceneId, React.FC> = {
  hook: HookScene,
  intro: () => <IntroScene stillFile="drag" stillFrame={clip('drag').frames - 1} />,
  boards: BoardsScene,
  live: LiveScene,
  details: DetailsScene,
  reviews: ReviewsScene,
  filters: FiltersScene,
  claude: ClaudeScene,
  import: ImportScene,
  login: LoginScene,
};

/** Music gain: -10 dB, ducked to -18 dB while the voice speaks; fades at both ends. */
function musicVolume(frame: number) {
  const t = frame / FPS;
  let duck = 0;
  for (const l of ALL_LINES) {
    const w = interpolate(t, [l.start - 0.35, l.start - 0.05, l.end + 0.1, l.end + 0.6], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    duck = Math.max(duck, w);
  }
  const db = -10 - 8 * duck;
  const fadeIn = interpolate(t, [0, 0.8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(t, [TOTAL_SECONDS - 3, TOTAL_SECONDS], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.pow(10, db / 20) * fadeIn * fadeOut;
}

const SceneFade: React.FC<{ children: React.ReactNode; duration: number; first: boolean; last: boolean }> = ({ children, duration, first, last }) => {
  const frame = useCurrentFrame();
  const fadeIn = first ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = last ? 1 : interpolate(frame, [duration - 1, duration + FADE - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = interpolate(fadeIn, [0, 1], [0.985, 1]);
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
};

export const Main: React.FC = () => {
  const featureScenes = SCENES.filter((s) => s.title && s.id !== 'intro');
  return (
    <AbsoluteFill style={{ backgroundColor: '#07122b' }}>
      <Background />
      {SCENES.map((s, i) => {
        const Comp = SCENE_COMPONENTS[s.id];
        const from = Math.round(s.start * FPS);
        const duration = Math.round(s.end * FPS) - from;
        const fIndex = featureScenes.findIndex((f) => f.id === s.id);
        return (
          <Sequence key={s.id} from={from} durationInFrames={duration + (i < SCENES.length - 1 ? FADE : 0)} name={s.id}>
            <SceneFade duration={duration} first={i === 0} last={i === SCENES.length - 1}>
              <Comp />
              {fIndex >= 0 && <SceneChip index={fIndex + 1} total={featureScenes.length} title={s.title!} x={240} />}
            </SceneFade>
          </Sequence>
        );
      })}
      <ProgressBar />
      <Captions />
      <Audio src={staticFile('audio/music.wav')} volume={musicVolume} />
      {ALL_LINES.map((l) => (
        <Sequence key={l.file} from={Math.round(l.start * FPS)} name={`vo ${l.file}`}>
          <Audio src={staticFile(l.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
