import { theme as antdTheme, type ThemeConfig } from 'antd';

export const PRIMARY_COLOR = '#2f54eb';

export function buildAntdTheme(dark: boolean): ThemeConfig {
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: PRIMARY_COLOR,
      borderRadius: 8,
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    },
    components: {
      Layout: {
        // Match the CSS variables in index.css (--column-bg / --page-bg).
        headerBg: dark ? '#191c21' : '#ffffff',
        headerHeight: 56,
        headerPadding: '0 20px',
        bodyBg: dark ? '#0f1115' : '#eef0f4',
      },
    },
  };
}
