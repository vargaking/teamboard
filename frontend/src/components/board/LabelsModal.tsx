import { useState } from 'react';
import { App, Button, ColorPicker, Empty, Input, List, Modal, Popconfirm, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { BoardDetail, Label } from '../../api/types';
import { getErrorMessage } from '../../api/client';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from '../../hooks/useBoards';
import { LabelTag } from '../LabelTag';

const PRESETS = ['#f5222d', '#fa8c16', '#fadb14', '#52c41a', '#13c2c2', '#1677ff', '#2f54eb', '#722ed1', '#eb2f96', '#8c8c8c'];
const presetConfig = [{ label: 'Suggested', colors: PRESETS }];

type Props = { board: BoardDetail; open: boolean; onClose: () => void };

function LabelRow({ boardId, label }: { boardId: number; label: Label }) {
  const { message } = App.useApp();
  const updateLabel = useUpdateLabel(boardId);
  const deleteLabel = useDeleteLabel(boardId);
  const [name, setName] = useState(label.name);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === label.name) {
      setName(label.name);
      return;
    }
    updateLabel.mutate(
      { labelId: label.id, name: trimmed },
      { onError: (err) => void message.error(getErrorMessage(err, 'Could not rename label')) },
    );
  };

  return (
    <List.Item
      actions={[
        <Popconfirm
          key="delete"
          title={`Delete label "${label.name}"?`}
          description="It will be removed from all cards."
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={() =>
            deleteLabel.mutateAsync(label.id).catch((err: unknown) => {
              void message.error(getErrorMessage(err, 'Could not delete label'));
            })
          }
        >
          <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete label" loading={deleteLabel.isPending} />
        </Popconfirm>,
      ]}
    >
      <Space>
        <ColorPicker
          value={label.color}
          presets={presetConfig}
          disabledAlpha
          onChangeComplete={(color) => {
            const hex = color.toHexString();
            if (hex !== label.color) {
              updateLabel.mutate(
                { labelId: label.id, color: hex },
                { onError: (err) => void message.error(getErrorMessage(err, 'Could not change color')) },
              );
            }
          }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onPressEnter={saveName}
          maxLength={50}
          style={{ width: 200 }}
        />
        <LabelTag color={label.color}>{name || label.name}</LabelTag>
      </Space>
    </List.Item>
  );
}

export function LabelsModal({ board, open, onClose }: Props) {
  const { message } = App.useApp();
  const createLabel = useCreateLabel(board.id);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESETS[5]);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    createLabel.mutate(
      { name, color: newColor },
      {
        onSuccess: () => setNewName(''),
        onError: (err) => void message.error(getErrorMessage(err, 'Could not create label')),
      },
    );
  };

  return (
    <Modal title="Labels" open={open} onCancel={onClose} footer={<Button onClick={onClose}>Done</Button>} width={560}>
      {board.labels.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No labels yet" />
      ) : (
        <List
          size="small"
          dataSource={board.labels}
          rowKey="id"
          renderItem={(label) => <LabelRow key={`${label.id}-${label.name}`} boardId={board.id} label={label} />}
        />
      )}
      <Space.Compact style={{ marginTop: 16, width: '100%' }}>
        <ColorPicker
          value={newColor}
          presets={presetConfig}
          disabledAlpha
          onChangeComplete={(color) => setNewColor(color.toHexString())}
        />
        <Input
          placeholder="New label name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={add}
          maxLength={50}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={add} loading={createLabel.isPending} disabled={!newName.trim()}>
          Add
        </Button>
      </Space.Compact>
    </Modal>
  );
}
