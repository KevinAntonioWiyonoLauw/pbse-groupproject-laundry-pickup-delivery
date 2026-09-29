'use client';

import Link from 'next/link';
import { LoginButton } from './login-button';

export function SignInPrompt({
  title = 'Masuk untuk melanjutkan',
  message = 'Halaman ini menampilkan data sesuai peran akunmu.',
}: { title?: string; message?: string }) {
  return (
    <section className="rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-100/60 to-white p-9 md:p-16">
      <Link className="text-sm font-bold text-primary-600" href="/">← Kembali ke beranda</Link>
      <p className="mt-10 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-600">Akses akun</p>
      <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-black-600 md:text-6xl">{title}</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-neutral-700">{message}</p>
      <LoginButton className="mt-5">Masuk dengan akun</LoginButton>
    </section>
  );
}
