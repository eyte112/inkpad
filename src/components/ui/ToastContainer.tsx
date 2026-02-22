import { useToastStore } from '@/stores/toastStore';
import { Toast } from './Toast';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          toast={toast}
          index={index}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
