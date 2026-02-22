import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/helpers';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  helperText?: string;
  error?: string;
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
}

const sizeStyles = {
  sm: 'h-9 px-3 py-2 text-sm',
  md: 'h-11 px-4 py-2.5 text-base',
  lg: 'h-13 px-4 py-3 text-lg',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size = 'md',
      label,
      helperText,
      error,
      prefixIcon,
      suffixIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const hasError = !!error;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-on-surface mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {prefixIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted">
              {prefixIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full rounded-xl border transition-all duration-150',
              'bg-surface-card',
              'text-on-surface',
              'placeholder:text-on-surface-muted',
              'focus:outline-none focus:ring-2',
              hasError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                : 'border-border focus:border-primary-500 focus:ring-primary-500/20',
              disabled && 'bg-surface-card cursor-not-allowed opacity-60',
              prefixIcon && 'pl-10',
              suffixIcon && 'pr-10',
              sizeStyles[size],
              className
            )}
            disabled={disabled}
            {...props}
          />
          {suffixIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-muted">
              {suffixIcon}
            </div>
          )}
        </div>
        {(helperText || error) && (
          <p className={cn(
            'mt-1.5 text-sm',
            hasError ? 'text-red-500' : 'text-on-surface-muted'
          )}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
