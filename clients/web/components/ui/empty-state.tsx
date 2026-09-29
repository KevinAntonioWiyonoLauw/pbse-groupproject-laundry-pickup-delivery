export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-7">
      <strong className="text-black-600">Belum ada data</strong>
      <p className="mb-0 text-neutral-600">{message}</p>
    </div>
  );
}
