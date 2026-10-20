import type { ThemeConfig } from 'antd';

export const PRIMARY_COLOR = '#2f54eb';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: PRIMARY_COLOR,
    borderRadius: 8,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 56,
      headerPadding: '0 20px',
      bodyBg: '#f0f2f5',
    },
  },
};
