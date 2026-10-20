import { App, Button, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { copyText } from '../utils/clipboard';

type Props = {
  value: string;
  /** What is being copied, for the success message and the button's accessible name. */
  label: string;
  /** Render as a multi-line code block (commands) instead of a single line. */
  block?: boolean;
  /** Displayed text if different from the copied value (e.g. with a placeholder highlighted). */
  display?: string;
};

/** Monospace value with a copy button. Works over plain http too (execCommand fallback). */
export function CopyField({ value, label, block, display }: Props) {
  const { message } = App.useApp();
  return (
    <div className={`copy-field${block ? ' is-block' : ''}`}>
      <code className="copy-field-value" aria-label={label}>
        {display ?? value}
      </code>
      <Tooltip title={`Copy ${label}`}>
        <Button
          size="small"
          icon={<CopyOutlined />}
          aria-label={`Copy ${label}`}
          onClick={() =>
            copyText(value).then(
              () => void message.success(`Copied ${label}`),
              () => void message.error('Could not copy to clipboard'),
            )
          }
        />
      </Tooltip>
    </div>
  );
}
