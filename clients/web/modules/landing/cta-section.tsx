import { LoginButton } from '../../components/ui/login-button';

export function CtaSection() {
  return (
    <section className="flex flex-col items-start justify-between gap-5 rounded-2xl bg-black-600 p-7 text-white md:flex-row md:items-center md:p-9">
      <div>
        <h2 className="m-0 text-2xl font-bold">Siap mengatur laundry?</h2>
        <p className="mt-2 text-neutral-300">Masuk untuk membuka dashboard sesuai peranmu.</p>
      </div>
      <LoginButton variant="secondary" size="lg" className="border-primary-300 bg-primary-300 text-primary-1000 hover:bg-primary-200">Masuk untuk mulai</LoginButton>
    </section>
  );
}
