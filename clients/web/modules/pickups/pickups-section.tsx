'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authenticatedRequest, roleOf } from '../../src/lib/auth';
import { apiMessage } from '../../src/lib/error-message';
import { type Pickup } from '../../src/lib/models';
import { useSession } from '../../src/lib/use-session';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { Freshness } from '../../components/ui/freshness';
import { LoadingState } from '../../components/ui/loading-state';
import { PageHeader } from '../../components/ui/page-header';
import { SignInPrompt } from '../../components/ui/sign-in-prompt';
import { StatusBadge } from '../../components/ui/status-badge';

export default function PickupsPage() {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<'loading' | 'empty' | 'error' | 'content'>('loading');
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(0);
  const etag = useRef<string | null>(null);
  const cache = useRef<Pickup[]>([]);

  useEffect(() => {
    if (!session || roleOf(session) !== 'staff') return;
    let active = true;
    const load = async () => {
      setState('loading');
      try {
        const result = await authenticatedRequest<Pickup[]>('/pickups', { headers: etag.current ? { 'If-None-Match': etag.current } : undefined });
        if (!active) return;
        if (result.status !== 304) { cache.current = result.data ?? []; setPickups(cache.current); etag.current = result.etag; }
        setFetchedAt(Date.now());
        setState(cache.current.length ? 'content' : 'empty');
      } catch (requestError) { if (active) { setError(apiMessage(requestError)); setState('error'); } }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session]);

  if (sessionLoading) return <LoadingState />;
  if (!session) return <SignInPrompt title="Masuk sebagai staff" message="Halaman pickup hanya dapat dibuka oleh staff laundry yang sudah terautentikasi." />;
  if (roleOf(session) !== 'staff') return <ErrorState message="Halaman pickup hanya tersedia untuk staff." retry={() => undefined} />;
  const retry = () => window.location.reload();
  return <><PageHeader eyebrow="Staff" title="Pickup" description="Pantau penugasan pickup di outlet akun ini." action={<Button variant="secondary" onClick={retry}>Sinkronkan</Button>} />{state === 'loading' && <LoadingState />}{state === 'empty' && <EmptyState message="Belum ada pickup pada outlet ini." />}{state === 'error' && <ErrorState message={error} retry={retry} />}{state === 'content' && <><div className="grid gap-3">{pickups.map((pickup) => <Link className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-px hover:border-primary-200" href={`/orders/${encodeURIComponent(pickup.orderId)}`} key={pickup.id}><div><strong>{pickup.orderId}</strong><span className="mt-1 block text-sm text-neutral-600">{pickup.driverId} · {new Date(pickup.scheduledAt).toLocaleString('id-ID')}</span></div><StatusBadge>{pickup.status}</StatusBadge></Link>)}</div><Freshness timestamp={fetchedAt} /></>}</>;
}
