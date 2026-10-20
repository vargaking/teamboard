import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Main';
import { TOTAL_FRAMES } from './timeline';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition id="TeamBoardPromo" component={Main} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
);
