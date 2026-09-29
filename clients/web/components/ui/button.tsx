import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dark';
type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  secondary: 'border border-neutral-300 bg-white text-neutral-800 hover:border-primary-300 hover:text-primary-700',
  danger: 'border border-red-200 bg-white text-red-400 hover:border-red-300 hover:bg-red-100/30',
  dark: 'bg-black-600 text-white hover:bg-black-500',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-sm',
  lg: 'px-5 py-3.5',
};

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={`rounded-xl font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 ${variants[variant]} ${sizes[size]} ${className}`}
      type="button"
      {...props}
    />
  );
}
