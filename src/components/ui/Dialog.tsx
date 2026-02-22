import { ReactNode, useEffect } from 'react';
import { cn } from '@/utils/helpers';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  showCloseButton?: boolean;
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Dialog({
  open,
  onOpenChange,
  size = 'md',
  title,
  description,
  children,
  footer,
  showCloseButton = true,
}: DialogProps) {
  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Content */}
      <div
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'w-full p-4',
          sizeStyles[size]
        )}
      >
        <div className="bg-surface-menu backdrop-blur-xl rounded-2xl shadow-2xl border border-border max-h-[calc(100vh-2rem)] flex flex-col">
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                {title && (
                  <h2 className="text-lg font-semibold text-on-surface">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-1 text-sm text-on-surface-muted">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-xl text-on-surface-muted hover:bg-surface-card transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
