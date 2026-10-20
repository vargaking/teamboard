import { Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useThemeMode, type ThemeMode } from '../theme/ThemeModeContext';

const NEXT_LABEL: Record<ThemeMode, string> = { system: 'Light', light: 'Dark', dark: 'System' };

/** Cycles System -> Light -> Dark. In System mode the icon shows the OS theme plus "AUTO". */
export function ThemeToggle() {
  const { mode, resolved, cycle } = useThemeMode();
  const current = mode === 'system' ? `System (${resolved})` : mode === 'light' ? 'Light' : 'Dark';
  const label = `Theme: ${current}. Switch to ${NEXT_LABEL[mode]}`;
  return (
    <Tooltip title={label}>
      <Button
        type="text"
        className="theme-toggle"
        aria-label={label}
        data-theme-mode={mode}
        onClick={cycle}
        icon={resolved === 'dark' ? <MoonOutlined /> : <SunOutlined />}
      >
        {mode === 'system' && <span className="theme-toggle-auto">AUTO</span>}
      </Button>
    </Tooltip>
  );
}
