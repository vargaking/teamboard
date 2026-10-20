import { Config } from '@remotion/cli/config';

// Use the pre-installed Playwright headless shell instead of letting Remotion download Chrome.
// Override with REMOTION_BROWSER=/path/to/headless_shell if it lives elsewhere.
Config.setBrowserExecutable(
  process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setAudioCodec('aac');
Config.setOverwriteOutput(true);
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY ?? 2));
