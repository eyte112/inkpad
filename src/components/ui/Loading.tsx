import { cn } from '@/utils/helpers';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
  xl: 'w-12 h-12 border-4',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'rounded-full border-border border-t-primary-500 animate-spin',
        sizeStyles[size],
        className
      )}
    />
  );
}

export interface SkeletonProps {
  className?: string;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

const roundedStyles = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export function Skeleton({ className, rounded = 'md' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-border animate-pulse',
        roundedStyles[rounded],
        className
      )}
    />
  );
}

export interface LoadingProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Loading({ text = '加载中...', size = 'lg' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Spinner size={size} />
      {text && (
        <p className="text-sm text-on-surface-muted">{text}</p>
      )}
    </div>
  );
}
