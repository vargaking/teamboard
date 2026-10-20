import { App, Form, Input, Modal } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../api/auth';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Values = { current_password: string; new_password: string; confirm: string };

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { setUser } = useAuth();

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      changePassword({ current_password: values.current_password, new_password: values.new_password }),
    onSuccess: (user) => {
      setUser(user);
      void message.success('Password changed');
      form.resetFields();
      onClose();
    },
    onError: (err) => {
      void message.error(getErrorMessage(err, 'Could not change password'));
    },
  });

  return (
    <Modal
      title="Change password"
      open={open}
      okText="Change password"
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)} requiredMark={false}>
        <Form.Item name="current_password" label="Current password" rules={[{ required: true, message: 'Enter your current password' }]}>
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="New password"
          rules={[
            { required: true, message: 'Enter a new password' },
            { min: 6, message: 'Use at least 6 characters' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm new password"
          dependencies={['new_password']}
          rules={[
            { required: true, message: 'Repeat the new password' },
            ({ getFieldValue }) => ({
              validator: (_rule, value: string | undefined) =>
                !value || getFieldValue('new_password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Passwords do not match')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
