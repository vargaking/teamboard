import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, Input, Space } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';

type Props = {
  buttonLabel: string;
  placeholder: string;
  submitLabel: string;
  loading?: boolean;
  /** Return a promise; the input stays open (for quick repeated entry) and clears on success. */
  onSubmit: (value: string) => Promise<unknown>;
  className?: string;
};

export type InlineAddInputHandle = { open: () => void };

/** "+ Add ..." button that turns into an input; Enter saves, Esc cancels. */
export const InlineAddInput = forwardRef<InlineAddInputHandle, Props>(function InlineAddInput(
  { buttonLabel, placeholder, submitLabel, loading, onSubmit, className },
  ref,
) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ open: () => setEditing(true) }), []);

  // Bring the input into view when opened (e.g. from a context menu on a long column).
  useEffect(() => {
    if (editing) containerRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [editing]);

  const cancel = () => {
    setEditing(false);
    setValue('');
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch {
      // error is reported by the caller; keep the text so it can be retried
    }
  };

  if (!editing) {
    return (
      <Button type="text" icon={<PlusOutlined />} className={className} block onClick={() => setEditing(true)}>
        {buttonLabel}
      </Button>
    );
  }

  return (
    <div className={className} ref={containerRef}>
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={() => void submit()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
        }}
        disabled={loading}
        maxLength={200}
      />
      <Space size={4} style={{ marginTop: 8 }}>
        <Button type="primary" size="small" loading={loading} onClick={() => void submit()}>
          {submitLabel}
        </Button>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={cancel} aria-label="Cancel" />
      </Space>
    </div>
  );
});
