import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
      <div>
        <p className="m-0 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-600">{eyebrow}</p>
        <h1 className="my-2 text-4xl font-bold leading-tight tracking-tight text-black-600 md:text-6xl">{title}</h1>
        <p className="leading-relaxed text-neutral-600">{description}</p>
      </div>
      {action}
    </header>
  );
}
