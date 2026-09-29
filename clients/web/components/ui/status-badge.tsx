export function StatusBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-primary-100 px-3 py-1.5 text-xs font-extrabold text-primary-800">
      {children}
    </span>
  );
}
