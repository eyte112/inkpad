import { useState } from 'react';
import { Dialog, Input, Button } from '@/components/ui';
import { authApi } from '@/services/auth';
import { toast } from '@/stores/toastStore';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!oldPassword) {
      toast.warning('请输入旧密码');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      toast.warning('新密码长度至少 4 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.warning('两次输入的新密码不一致');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      toast.success('密码修改成功');
      handleClose();
    } catch (err) {
      toast.error('修改失败', err instanceof Error ? err.message : '请检查旧密码');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()} title="修改密码">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          placeholder="当前密码"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoFocus
        />
        <Input
          type="password"
          placeholder="新密码（至少4位）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          type="password"
          placeholder="确认新密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button type="submit" disabled={isLoading} className="btn-glow">
            {isLoading ? '修改中...' : '确认修改'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
