const benefits = [
  ['01', 'Satu alur pickup', 'Buat order, tentukan alamat, dan pantau prosesnya dari satu tempat.'],
  ['02', 'Status selalu jelas', 'Lihat status order dan penugasan pickup sesuai peran akunmu.'],
  ['03', 'Siap untuk tim', 'Customer dan staff melihat tindakan yang memang menjadi kewenangannya.'],
] as const;

export function BenefitsSection() {
  return (
    <section id="cara-kerja" className="grid gap-8">
      <div className="max-w-2xl">
        <p className="m-0 text-xs font-extrabold uppercase tracking-[0.18em] text-primary-600">Cara kerja</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-black-600 md:text-4xl">Dari order sampai pickup, alurnya tetap terlihat.</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {benefits.map(([number, title, description]) => (
          <article className="rounded-2xl border border-neutral-200 bg-white p-6" key={number}>
            <span className="text-sm font-extrabold text-primary-600">{number}</span>
            <h3 className="mt-8 text-xl font-bold text-black-600">{title}</h3>
            <p className="mt-2 leading-relaxed text-neutral-600">{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
