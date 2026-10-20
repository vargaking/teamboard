import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Empty, Input, Popconfirm, Space, Spin, Typography } from 'antd';
import { ClearOutlined, SendOutlined } from '@ant-design/icons';
import type { BoardDetail, ChatMessage } from '../../api/types';
import { CHAT_MAX_CHARS, CHAT_MAX_MESSAGES, useBoardChat } from '../../hooks/useAI';
import { AITheme, AITitle } from './aiTheme';
import { useAI } from './AIContext';
import { Markdown } from './Markdown';

type Props = { board: BoardDetail; open: boolean; onClose: () => void };

const SUGGESTIONS = ['What is overdue?', 'Who has the most work right now?', 'What should we focus on this week?'];

/**
 * Stateless chat (per contract): the whole history (last 30 messages) is sent on every call.
 * History lives in this component's state only; it survives closing the drawer while the board
 * page is open (the Drawer keeps its content mounted) and is lost on navigation.
 */
export function ChatDrawer({ board, open, onClose }: Props) {
  const { handleAIError } = useAI();
  const chat = useBoardChat(board.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chat.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setDraft('');
    chat.mutate(history, {
      onSuccess: (res) => setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]),
      onError: (err) => {
        // Put the failed question back into the input so it is not lost.
        setMessages((prev) => (prev[prev.length - 1]?.content === content ? prev.slice(0, -1) : prev));
        setDraft(content);
        handleAIError(err, 'Chat request failed');
      },
    });
  };

  return (
    <AITheme>
      <Drawer
        title={<AITitle>Chat with "{board.title}"</AITitle>}
        placement="right"
        width={460}
        open={open}
        onClose={onClose}
        className="ai-chat-drawer"
        extra={
          <Popconfirm
            title="Clear the conversation?"
            okText="Clear"
            onConfirm={() => {
              setMessages([]);
              chat.reset();
            }}
            disabled={messages.length === 0}
          >
            <Button size="small" icon={<ClearOutlined />} disabled={messages.length === 0 || chat.isPending}>
              Clear
            </Button>
          </Popconfirm>
        }
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <div className="ai-chat-list" ref={listRef} aria-live="polite">
          {messages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Ask anything about this board. The AI sees the current cards, columns and people."
            >
              <Space direction="vertical">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} size="small" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </Space>
            </Empty>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`ai-chat-msg is-${m.role}`}>
                <div className="ai-chat-bubble">
                  {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : <span>{m.content}</span>}
                </div>
              </div>
            ))
          )}
          {chat.isPending && (
            <div className="ai-chat-msg is-assistant">
              <div className="ai-chat-bubble ai-chat-typing">
                <Spin size="small" /> <Typography.Text type="secondary">Thinking...</Typography.Text>
              </div>
            </div>
          )}
        </div>
        <div className="ai-chat-composer">
          <Input.TextArea
            aria-label="Chat message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Ask about this board (Enter to send, Shift+Enter for a new line)"
            autoSize={{ minRows: 2, maxRows: 6 }}
            maxLength={CHAT_MAX_CHARS}
          />
          <div className="ai-chat-composer-footer">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {messages.length > CHAT_MAX_MESSAGES
                ? `Only the last ${CHAT_MAX_MESSAGES} messages are sent as context.`
                : 'AI can be wrong; check important answers on the board.'}
            </Typography.Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => send(draft)}
              loading={chat.isPending}
              disabled={!draft.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </Drawer>
    </AITheme>
  );
}
