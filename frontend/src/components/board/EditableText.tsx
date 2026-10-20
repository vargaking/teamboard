import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { Input, type InputRef } from 'antd';

type Props = {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  style?: CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Allow saving an empty string (default: empty input reverts). */
  allowEmpty?: boolean;
  size?: 'small' | 'middle' | 'large';
};

export type EditableTextHandle = { startEditing: () => void };

/** Click to edit; Enter or blur saves, Esc cancels. */
export const EditableText = forwardRef<EditableTextHandle, Props>(function EditableText({
  value,
  onSave,
  className,
  inputClassName,
  style,
  placeholder,
  disabled,
  maxLength = 200,
  allowEmpty = false,
  size = 'middle',
}, ref) {
  const [editing, setEditing] = useState(false);
  useImperativeHandle(ref, () => ({ startEditing: () => setEditing(true) }), []);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<InputRef>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      cancelledRef.current = false;
      inputRef.current?.focus({ cursor: 'all' });
    }
  }, [editing]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    setEditing(false);
    const trimmed = draft.trim();
    if ((!trimmed && !allowEmpty) || trimmed === value) {
      setDraft(value);
      return;
    }
    onSave(trimmed);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        size={size}
        className={inputClassName}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onPressEnter={commit}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            cancelledRef.current = true;
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      className={`editable-text${disabled ? '' : ' is-editable'}${className ? ` ${className}` : ''}`}
      style={style}
      onClick={() => {
        if (!disabled) setEditing(true);
      }}
      onKeyDown={(e) => {
        if (!disabled && e.key === 'Enter') setEditing(true);
      }}
      title={disabled ? undefined : 'Click to edit'}
    >
      {value || <span className="editable-placeholder">{placeholder}</span>}
    </span>
  );
});
