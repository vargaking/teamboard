import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Radio, Select, Space, Spin, Typography } from 'antd';
import { ApiOutlined, DeleteOutlined } from '@ant-design/icons';
import { getErrorMessage } from '../../api/client';
import type { AIProvider, AISettingsUpdate } from '../../api/types';
import {
  useAIModels,
  useAISettings,
  useDeleteAISettings,
  useTestAIConnection,
  useUpdateAISettings,
} from '../../hooks/useAI';
import { AITheme, AITitle } from './aiTheme';

const PROVIDERS: { value: AIProvider; label: string; keyPlaceholder: string }[] = [
  { value: 'anthropic', label: 'Anthropic', keyPlaceholder: 'sk-ant-...' },
  { value: 'openai', label: 'OpenAI', keyPlaceholder: 'sk-...' },
];

type Props = { open: boolean; onClose: () => void };

export function AISettingsModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const settings = useAISettings(open);
  const update = useUpdateAISettings();
  const remove = useDeleteAISettings();
  const test = useTestAIConnection();

  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string | null>(null);

  const stored = settings.data;
  // Reset the form from the stored settings whenever the modal opens / settings load.
  useEffect(() => {
    if (!open || !stored) return;
    setProvider(stored.provider ?? 'anthropic');
    setModel(stored.model);
    setApiKey('');
  }, [open, stored]);

  // Models come from the provider using the *stored* key, so only load them when the stored
  // provider matches the one selected in the form.
  const providerMatchesStored = stored?.has_key === true && stored.provider === provider;
  const models = useAIModels(stored?.provider ?? null, open && providerMatchesStored);

  const keyRequired = !stored?.has_key || stored.provider !== provider;
  const canSave = !keyRequired || apiKey.trim() !== '';

  const onSave = () => {
    const body: AISettingsUpdate = { provider };
    if (apiKey.trim()) body.api_key = apiKey.trim();
    if (model && providerMatchesStored && body.api_key === undefined) body.model = model;
    update.mutate(body, {
      onSuccess: (saved) => {
        setApiKey('');
        if (saved.model) {
          void message.success('AI settings saved');
          onClose();
        } else {
          void message.success('Key saved. Now choose a model.');
        }
      },
      onError: (err) => void message.error(getErrorMessage(err, 'Could not save AI settings')),
    });
  };

  const onTest = () =>
    test.mutate(undefined, {
      onSuccess: (res) => void message.success(`Connection OK (model: ${res.model})`),
      onError: (err) => void message.error(getErrorMessage(err, 'Connection test failed'), 6),
    });

  const providerInfo = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  let modelHint: string | null = null;
  if (!stored?.has_key) modelHint = 'Save your API key first; the model list is loaded from the provider.';
  else if (!providerMatchesStored) modelHint = 'Save the key for this provider first to load its models.';
  else if (apiKey.trim()) modelHint = 'Save the new key first to reload the model list.';

  return (
    <AITheme>
      <Modal
        title={<AITitle>AI settings</AITitle>}
        open={open}
        onCancel={onClose}
        destroyOnHidden
        className="ai-settings-modal"
        footer={
          <div className="ai-settings-footer">
            {stored?.has_key ? (
              <Popconfirm
                title="Remove your AI key?"
                description="Provider, key and model are deleted from the server."
                okText="Remove"
                okButtonProps={{ danger: true }}
                onConfirm={() =>
                  remove.mutateAsync().then(
                    () => {
                      void message.success('AI key removed');
                      setApiKey('');
                      setModel(null);
                    },
                    (err: unknown) => void message.error(getErrorMessage(err, 'Could not remove key')),
                  )
                }
              >
                <Button danger icon={<DeleteOutlined />} loading={remove.isPending}>
                  Remove key
                </Button>
              </Popconfirm>
            ) : (
              <span />
            )}
            <Space>
              <Button
                icon={<ApiOutlined />}
                onClick={onTest}
                loading={test.isPending}
                disabled={!stored?.has_key || !stored.model}
              >
                Test connection
              </Button>
              <Button onClick={onClose}>Close</Button>
              <Button type="primary" onClick={onSave} loading={update.isPending} disabled={!canSave}>
                Save
              </Button>
            </Space>
          </div>
        }
      >
        {settings.isPending ? (
          <div className="center-block-small">
            <Spin />
          </div>
        ) : settings.isError ? (
          <Alert type="error" showIcon message="Could not load AI settings" description={getErrorMessage(settings.error)} />
        ) : (
          <Form layout="vertical" requiredMark={false}>
            <Typography.Paragraph type="secondary">
              AI features use your own provider key. It is stored encrypted on the TeamBoard server and only used for
              your requests. AI never changes the board on its own: you review every proposal first.
            </Typography.Paragraph>
            <Form.Item label="Provider">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as AIProvider);
                  setModel(null);
                }}
                options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
              />
            </Form.Item>
            <Form.Item
              label="API key"
              extra={
                stored?.has_key && stored.provider === provider
                  ? `A key is stored (${stored.key_hint ?? '…'}). Leave empty to keep it.`
                  : undefined
              }
            >
              <Input.Password
                aria-label="API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  stored?.has_key && stored.provider === provider
                    ? `Stored key ${stored.key_hint ?? ''}`
                    : providerInfo.keyPlaceholder
                }
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              label="Model"
              extra={modelHint}
              validateStatus={models.isError ? 'error' : undefined}
              help={models.isError ? getErrorMessage(models.error, 'Could not load models') : undefined}
            >
              <Select<string>
                aria-label="Model"
                showSearch
                optionFilterProp="label"
                placeholder="Choose a model"
                value={model ?? undefined}
                onChange={setModel}
                disabled={modelHint !== null}
                loading={models.isFetching}
                options={(models.data ?? []).map((m) => ({ value: m.id, label: m.label }))}
                notFoundContent={models.isFetching ? <Spin size="small" /> : 'No models'}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </AITheme>
  );
}
