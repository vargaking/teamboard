import { useEffect } from 'react';
import { App, Button, Modal, Space, Spin, Typography } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { BoardDetail } from '../../api/types';
import { useBoardSummary } from '../../hooks/useAI';
import { copyText } from '../../utils/clipboard';
import { AITheme, AITitle } from './aiTheme';
import { useAI } from './AIContext';
import { Markdown } from './Markdown';

type Props = { board: BoardDetail; open: boolean; onClose: () => void };

export function SummaryModal({ board, open, onClose }: Props) {
  const { message } = App.useApp();
  const { handleAIError } = useAI();
  const summary = useBoardSummary(board.id);
  const { mutate, reset } = summary;

  const generate = () =>
    mutate(undefined, {
      onError: (err) => {
        handleAIError(err, 'Could not summarise board');
        onClose();
      },
    });

  // Generate on open; clear when closed so the next open is fresh. Only `open` should trigger
  // this (generate is recreated every render), hence the narrow dependency list.
  useEffect(() => {
    if (open) generate();
    else reset();
  }, [open]);

  const text = summary.data?.summary ?? '';

  return (
    <AITheme>
      <Modal
        title={<AITitle>Board summary</AITitle>}
        open={open}
        onCancel={onClose}
        width={760}
        destroyOnHidden
        footer={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={generate} disabled={summary.isPending}>
              Regenerate
            </Button>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              disabled={!text}
              onClick={() =>
                copyText(text).then(
                  () => void message.success('Summary copied as markdown'),
                  () => void message.error('Could not copy to clipboard'),
                )
              }
            >
              Copy
            </Button>
          </Space>
        }
      >
        {summary.isPending ? (
          <div className="ai-loading-block">
            <Spin />
            <Typography.Text type="secondary">Summarising "{board.title}"... this can take a few seconds.</Typography.Text>
          </div>
        ) : text ? (
          <div className="ai-summary">
            <Markdown>{text}</Markdown>
          </div>
        ) : null}
      </Modal>
    </AITheme>
  );
}
