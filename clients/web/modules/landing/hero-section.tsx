import Link from 'next/link';
import { LoginButton } from '../../components/ui/login-button';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-primary-200 bg-gradient-to-br from-primary-100 via-white to-white px-7 py-12 md:px-16 md:py-20">
      <div className="relative z-[1] max-w-3xl">
        <p className="m-0 text-xs font-extrabold uppercase tracking-[0.18em] text-primary-600">Laundry pickup & delivery</p>
        <h1 className="mt-5 max-w-3xl text-5xl font-bold leading-[1.04] tracking-[-0.04em] text-black-600 md:text-7xl">Laundry selesai, kamu tetap punya waktu.</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-700">Kelola order dan pickup tanpa kehilangan konteks. Semua tindakan tampil sesuai peran akunmu.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <LoginButton size="lg">Masuk ke dashboard</LoginButton>
          <Link className="rounded-xl border border-primary-200 bg-white px-5 py-3.5 font-bold text-primary-700 transition hover:border-primary-300 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400" href="#cara-kerja">Lihat cara kerja</Link>
        </div>
      </div>
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-primary-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-primary-100/70 blur-2xl" />
    </section>
  );
}
