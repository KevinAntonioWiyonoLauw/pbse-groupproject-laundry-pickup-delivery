'use client';

import { useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { beginLogin } from '../../src/lib/auth';
import { Button } from './button';

type LoginButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
};

export function LoginButton({ children = 'Masuk', variant = 'primary', size = 'md', className = '', ...props }: LoginButtonProps) {
  const [error, setError] = useState('');
  const signIn = async () => {
    try {
      await beginLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login tidak dapat dimulai.');
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <Button {...props} className={className} variant={variant} size={size} onClick={() => void signIn()}>{children}</Button>
      {error && <span className="max-w-xs text-xs font-normal text-red-400" role="alert">{error}</span>}
    </span>
  );
}
