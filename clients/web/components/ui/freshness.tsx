export function Freshness({ timestamp, stale = false }: { timestamp: number; stale?: boolean }) {
  return (
    <p className="mt-4 text-xs text-neutral-600">
      {stale ? 'Data mungkin sudah lama; coba sinkronkan.' : `Sinkron ${new Date(timestamp).toLocaleTimeString('id-ID')}`}
    </p>
  )
};
