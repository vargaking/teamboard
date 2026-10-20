import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowLeftOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../api/client';
import { importTrelloBoard, previewTrelloImport, TRELLO_MAX_BYTES } from '../api/trello';
import type { TrelloExport, TrelloImportOptions, TrelloMemberMatch, TrelloPreview, User } from '../api/types';
import { queryKeys } from '../hooks/queryKeys';
import { useUsers } from '../hooks/useUsers';
import { UserAvatar } from './UserAvatar';

type Props = { open: boolean; onClose: () => void };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "4 lists · 37 cards · 5 labels · 12 comments; 2 archived lists and 9 archived cards" */
export function trelloSummary(p: TrelloPreview): string {
  const activeLists = p.lists.filter((l) => !l.archived).length;
  const archivedLists = p.lists.length - activeLists;
  const parts = [
    plural(activeLists, 'list'),
    plural(p.card_count, 'card'),
    plural(p.label_count, 'label'),
    plural(p.comment_count, 'comment'),
  ];
  if (p.checklist_count > 0) parts.push(plural(p.checklist_count, 'checklist'));
  let text = parts.join(' · ');
  const archived: string[] = [];
  if (archivedLists > 0) archived.push(plural(archivedLists, 'archived list'));
  if (p.archived_card_count > 0) archived.push(plural(p.archived_card_count, 'archived card'));
  if (archived.length > 0) text += `; ${archived.join(' and ')}`;
  return text;
}

function isPlainObject(value: unknown): value is TrelloExport {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

/**
 * The parsed export (possibly several MB) lives only in this component's state: the API is
 * called directly instead of via useMutation, whose cache would retain the request variables.
 */
function ImportWizard({ onClose }: { onClose: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const users = useUsers();

  const exportRef = useRef<TrelloExport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<TrelloPreview | null>(null);

  const [title, setTitle] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [memberMap, setMemberMap] = useState<Record<string, number | null>>({});
  const [importing, setImporting] = useState(false);

  const usersById = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);

  const reset = () => {
    exportRef.current = null;
    setPreview(null);
    setFileName(null);
    setFileError(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (file.size > TRELLO_MAX_BYTES) {
      setFileError(
        `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(TRELLO_MAX_BYTES)}. ` +
          'Archive or delete old cards in Trello and export again.',
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFileAsText(file));
    } catch (err) {
      setFileError(`This is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
      return;
    }
    if (!isPlainObject(parsed)) {
      setFileError('This JSON is not a Trello board export (expected an object).');
      return;
    }
    setPreviewing(true);
    try {
      const result = await previewTrelloImport({ export: parsed });
      exportRef.current = parsed;
      setPreview(result);
      setTitle(result.title);
      setIncludeArchived(false);
      setMemberMap(Object.fromEntries(result.members.map((m) => [m.trello_id, m.suggested_user_id])));
    } catch (err) {
      // 422: not a Trello board export — the backend says why.
      setFileError(getErrorMessage(err, 'Could not read this export'));
    } finally {
      setPreviewing(false);
    }
  };

  const mappedEntries = Object.entries(memberMap).filter((e): e is [string, number] => e[1] !== null);

  const runImport = async () => {
    const data = exportRef.current;
    if (!data || !preview) return;
    const options: TrelloImportOptions = {
      title: title.trim(),
      include_archived: includeArchived,
      member_map: Object.fromEntries(mappedEntries),
    };
    setImporting(true);
    try {
      const board = await importTrelloBoard({ export: data, options });
      queryClient.setQueryData(queryKeys.board(board.id), board);
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      void message.success(`Imported "${board.title}" from Trello`);
      exportRef.current = null;
      onClose();
      navigate(`/boards/${board.id}`);
    } catch (err) {
      void message.error(getErrorMessage(err, 'Import failed'));
      setImporting(false);
    }
  };

  const memberColumns: TableColumnsType<TrelloMemberMatch> = [
    {
      title: 'Trello member',
      key: 'trello',
      render: (_v: unknown, m) => (
        <div className="trello-member">
          <Typography.Text strong>{m.trello_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {m.trello_username ? `@${m.trello_username} · ` : ''}
            {plural(m.card_count, 'card')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'TeamBoard user',
      key: 'user',
      width: 280,
      render: (_v: unknown, m) => (
        <Select<number>
          aria-label={`Map ${m.trello_name}`}
          style={{ width: '100%' }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Don't map"
          loading={users.isPending}
          value={memberMap[m.trello_id] ?? undefined}
          onChange={(v) => setMemberMap((prev) => ({ ...prev, [m.trello_id]: v ?? null }))}
          onClear={() => setMemberMap((prev) => ({ ...prev, [m.trello_id]: null }))}
          options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
          optionRender={(option) => {
            const u: User | undefined = typeof option.value === 'number' ? usersById.get(option.value) : undefined;
            return u ? (
              <Space>
                <UserAvatar user={u} size="small" tooltip={false} />
                {u.name}
              </Space>
            ) : (
              option.label
            );
          }}
        />
      ),
    },
  ];

  const step = preview ? 1 : 0;
  const hasArchived = preview !== null && (preview.archived_card_count > 0 || preview.lists.some((l) => l.archived));

  const footer = preview ? (
    <Space>
      <Button icon={<ArrowLeftOutlined />} onClick={reset} disabled={importing}>
        Choose another file
      </Button>
      <Button
        type="primary"
        icon={<ImportOutlined />}
        onClick={() => void runImport()}
        loading={importing}
        disabled={importing || !title.trim()}
      >
        Import
      </Button>
    </Space>
  ) : (
    <Button onClick={onClose}>Cancel</Button>
  );

  return (
    <Modal
      open
      title={
        <Space>
          <ImportOutlined />
          Import from Trello
        </Space>
      }
      onCancel={() => {
        if (!importing) onClose();
      }}
      maskClosable={!importing}
      footer={footer}
      width={720}
      className="trello-import-modal"
    >
      <Steps size="small" current={step} items={[{ title: 'File' }, { title: 'Review' }]} style={{ marginBottom: 20 }} />

      {!preview && (
        <Spin spinning={previewing} tip="Reading the export...">
          <Upload.Dragger
            accept=".json,application/json"
            multiple={false}
            showUploadList={false}
            beforeUpload={(file) => {
              void handleFile(file);
              return false; // never upload: the file is read client-side
            }}
            disabled={previewing}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drop a Trello JSON export here</p>
            <p className="ant-upload-hint">Trello → board menu → Print and export → Export as JSON</p>
          </Upload.Dragger>
          {fileError && (
            <Alert
              type="error"
              showIcon
              className="trello-file-error"
              style={{ marginTop: 12 }}
              message={fileName ? `Can't import ${fileName}` : "Can't import this file"}
              description={fileError}
            />
          )}
        </Spin>
      )}

      {preview && (
        <Form layout="vertical" requiredMark={false} disabled={importing}>
          <Form.Item
            label="Board title"
            validateStatus={title.trim() ? undefined : 'error'}
            help={title.trim() ? undefined : 'Enter a title'}
          >
            <Input aria-label="Board title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Form.Item>
          {preview.description && (
            <Form.Item label="Description (from Trello)">
              <Typography.Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true }} style={{ margin: 0 }}>
                {preview.description}
              </Typography.Paragraph>
            </Form.Item>
          )}
          <Typography.Paragraph className="trello-summary">{trelloSummary(preview)}</Typography.Paragraph>
          <Form.Item style={{ marginBottom: 16 }}>
            <Checkbox
              checked={includeArchived}
              disabled={!hasArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            >
              Include archived lists and cards
            </Checkbox>
          </Form.Item>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Members
          </Typography.Title>
          {preview.members.length === 0 ? (
            <Typography.Paragraph type="secondary">This export has no members to map.</Typography.Paragraph>
          ) : (
            <>
              <Table<TrelloMemberMatch>
                size="small"
                rowKey="trello_id"
                pagination={false}
                columns={memberColumns}
                dataSource={preview.members}
                scroll={preview.members.length > 8 ? { y: 320 } : undefined}
              />
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                Mapped users become members of the new board and assignees of their cards; their comments are
                imported under their name. Comments by unmapped members are imported under your name with a
                "Name (Trello):" prefix. {mappedEntries.length} of {preview.members.length} mapped.
              </Typography.Paragraph>
            </>
          )}
        </Form>
      )}
    </Modal>
  );
}

/** Mounts the wizard only while open, so all state (incl. the parsed export) is dropped on close. */
export function TrelloImportModal({ open, onClose }: Props) {
  return open ? <ImportWizard onClose={onClose} /> : null;
}
