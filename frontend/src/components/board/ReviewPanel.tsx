import { useState } from 'react';
import { Button, Tag, Tooltip, Typography } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import type { ReviewCount } from '../../utils/board';
import { UserAvatar } from '../UserAvatar';

export const REVIEW_PANEL_KEY = 'teamboard_review_panel';
const WIDE_SCREEN_PX = 1200;

/** Stored 'open' | 'collapsed'; without a stored choice: open on screens >= 1200 px. */
function initialOpen(): boolean {
  try {
    const stored = localStorage.getItem(REVIEW_PANEL_KEY);
    if (stored === 'open') return true;
    if (stored === 'collapsed') return false;
  } catch {
    // storage unavailable: fall through to the screen-size default
  }
  return window.innerWidth >= WIDE_SCREEN_PX;
}

function storeOpen(open: boolean): void {
  try {
    localStorage.setItem(REVIEW_PANEL_KEY, open ? 'open' : 'collapsed');
  } catch {
    // not remembered; fine
  }
}

type Props = {
  counts: ReviewCount[];
  /** User the reviewer filter currently points at (null = no reviewer filter). */
  activeUserId: number | null;
  onSelect: (userId: number) => void;
};

/** Left sidebar of the board page: per-member review load, computed live from the board cache. */
export function ReviewPanel({ counts, activeUserId, onSelect }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const toggle = () =>
    setOpen((prev) => {
      storeOpen(!prev);
      return !prev;
    });

  if (!open) {
    return (
      <aside className="review-panel is-collapsed" aria-label="Review counts (collapsed)">
        <Tooltip title="Show review counts" placement="right">
          <Button type="text" icon={<MenuUnfoldOutlined />} onClick={toggle} aria-label="Show review counts" aria-expanded={false} />
        </Tooltip>
      </aside>
    );
  }

  const openTotal = counts.reduce((n, c) => n + c.inProgress, 0);
  const done = counts.reduce((n, c) => n + c.done, 0);

  return (
    <aside className="review-panel" aria-label="Review counts">
      <div className="review-panel-header">
        <Typography.Text strong>Review counts</Typography.Text>
        <Tooltip title="Hide review counts">
          <Button
            type="text"
            size="small"
            icon={<MenuFoldOutlined />}
            onClick={toggle}
            aria-label="Hide review counts"
            aria-expanded
          />
        </Tooltip>
      </div>
      <ul className="review-panel-list">
        {counts.map(({ user, inProgress, done: d }) => {
          const idle = inProgress === 0 && d === 0;
          const active = activeUserId === user.id;
          return (
            <li key={user.id}>
              <button
                type="button"
                className={`review-row${idle ? ' is-idle' : ''}${active ? ' is-active' : ''}`}
                aria-pressed={active}
                title={active ? 'Clear the reviewer filter' : `Show cards ${user.name} reviews`}
                onClick={() => onSelect(user.id)}
              >
                <UserAvatar user={user} size={24} tooltip={false} />
                <span className="review-row-name">{user.name}</span>
                <span className="review-row-counts">
                  <Tag bordered={false} color={inProgress > 0 ? 'blue' : undefined} className={inProgress > 0 ? '' : 'is-zero'}>
                    {inProgress} in progress
                  </Tag>
                  <Tag bordered={false} color={d > 0 ? 'green' : undefined} className={d > 0 ? '' : 'is-zero'}>
                    {d} done
                  </Tag>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="review-panel-footer">
        {openTotal} review{openTotal === 1 ? '' : 's'} open · {done} done
      </div>
    </aside>
  );
}
