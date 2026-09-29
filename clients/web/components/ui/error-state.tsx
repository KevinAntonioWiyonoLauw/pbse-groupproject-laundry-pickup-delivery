import { Button } from './button';

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-white p-7">
      <strong className="text-black-600">Data belum dapat dimuat</strong>
      <p className="text-neutral-600">{message}</p>
      <Button variant="secondary" onClick={retry}>Coba lagi</Button>
    </div>
  );
}
