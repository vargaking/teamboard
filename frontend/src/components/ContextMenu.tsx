import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';

/** Return `KEEP_OPEN` from onSelect to leave the menu open (e.g. for checkable items). */
export const KEEP_OPEN = 'keep-open';

type Props = {
  /** Built lazily, only while the menu is open, so it always reflects fresh data. */
  buildItems: () => MenuProps['items'];
  onSelect: (key: string) => void | typeof KEEP_OPEN;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** aria-label of the wrapper; helps tests and screen readers find the target. */
  ariaLabel?: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, [contenteditable="true"]') !== null;
}

/**
 * Right-click menu (antd Dropdown, trigger contextMenu) around a wrapper div.
 * - The innermost menu wins: the wrapper stops propagation so a card menu doesn't also open
 *   the column or canvas menu.
 * - Inside text inputs the browser's native menu is kept (copy/paste).
 * - Closes on scroll (any container, capture phase), Escape, resize and window blur.
 * - @hello-pangea/dnd only starts drags on the primary button, so right-click never drags.
 */
export function ContextMenu({ buildItems, onSelect, children, className, style, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onScroll = (e: Event) => {
      // Scrolling inside the menu itself (long submenus) must not close it.
      if (e.target instanceof Element && e.target.closest('.ant-dropdown')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  const stopInEditable = (e: MouseEvent) => {
    // Capture phase: keep the native menu in inputs and prevent every ContextMenu from opening.
    if (isEditableTarget(e.target)) e.stopPropagation();
  };

  return (
    <Dropdown
      trigger={['contextMenu']}
      open={open}
      destroyOnHidden
      onOpenChange={(next, info) => {
        // Item clicks are handled in onClick (so items can keep the menu open).
        if (info.source === 'menu') return;
        setOpen(next);
      }}
      menu={{
        items: open ? buildItems() : [],
        // rc-menu collapses open submenus on every item click unless `multiple` is set; we need
        // them to stay open for KEEP_OPEN items (checkable labels). Nothing here is selectable,
        // and the whole menu is closed explicitly for every other item.
        selectable: false,
        multiple: true,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          const result = onSelect(key);
          if (result !== KEEP_OPEN) setOpen(false);
        },
      }}
      overlayClassName="context-menu"
    >
      <div
        className={className}
        style={style}
        aria-label={ariaLabel}
        onContextMenuCapture={stopInEditable}
        onContextMenu={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </Dropdown>
  );
}
