import { useState, type ReactNode } from 'react';
import { Button, Dropdown, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';

export type DangerMenuAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  confirmTitle: string;
  confirmDescription?: ReactNode;
  okText?: string;
  onConfirm: () => Promise<unknown> | void;
};

type Props = {
  actions: DangerMenuAction[];
  ariaLabel: string;
  trigger?: ReactNode;
};

/**
 * "..." dropdown whose items each require a Popconfirm. The dropdown stays open while the
 * Popconfirm is shown (clicks inside the menu don't close it) and closes after confirm/cancel.
 */
export function DangerMenu({ actions, ariaLabel, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const items: MenuProps['items'] = actions.map((action) => ({
    key: action.key,
    danger: true,
    label: (
      <Popconfirm
        title={action.confirmTitle}
        description={action.confirmDescription}
        okText={action.okText ?? 'Delete'}
        okButtonProps={{ danger: true }}
        open={confirming === action.key}
        onOpenChange={(next) => setConfirming(next ? action.key : null)}
        onConfirm={async () => {
          await action.onConfirm();
          setConfirming(null);
          setOpen(false);
        }}
        onCancel={() => {
          setConfirming(null);
          setOpen(false);
        }}
        placement="right"
      >
        <span className="danger-menu-item">
          {action.icon}
          <span>{action.label}</span>
        </span>
      </Popconfirm>
    ),
  }));

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={(next, info) => {
        // Only the trigger toggles the menu; clicks on items open the Popconfirm instead.
        if (info.source === 'trigger') {
          setOpen(next);
          if (!next) setConfirming(null);
        }
      }}
      menu={{ items }}
      placement="bottomRight"
    >
      {trigger ?? <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={ariaLabel} />}
    </Dropdown>
  );
}
