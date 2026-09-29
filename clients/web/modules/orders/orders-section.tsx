'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authenticatedRequest } from '../../src/lib/auth';
import { apiMessage } from '../../src/lib/error-message';
import { type Order } from '../../src/lib/models';
import { useSession } from '../../src/lib/use-session';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { Freshness } from '../../components/ui/freshness';
import { LoadingState } from '../../components/ui/loading-state';
import { PageHeader } from '../../components/ui/page-header';
import { SignInPrompt } from '../../components/ui/sign-in-prompt';
import { StatusBadge } from '../../components/ui/status-badge';

type Collection = { orders: Order[]; fetchedAt: number };

export default function OrdersPage() {
  const { session, loading: sessionLoading } = useSession();
  const [status, setStatus] = useState('');
  const [state, setState] = useState<'loading' | 'empty' | 'error' | 'content'>('loading');
  const [data, setData] = useState<Collection>({ orders: [], fetchedAt: 0 });
  const [error, setError] = useState('');
  const etag = useRef<string | null>(null);
  const cache = useRef<Order[]>([]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const load = async () => {
      setState('loading');
      try {
        const query = status ? `?status=${encodeURIComponent(status)}` : '';
        const result = await authenticatedRequest<Order[]>(`/orders${query}`, { headers: etag.current ? { 'If-None-Match': etag.current } : undefined });
        if (!active) return;
        if (result.status !== 304) {
          cache.current = result.data ?? [];
          etag.current = result.etag;
        }
        const orders = cache.current;
        setData({ orders, fetchedAt: Date.now() });
        setState(orders.length ? 'content' : 'empty');
      } catch (requestError) {
        if (!active) return;
        setError(apiMessage(requestError));
        setState('error');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session, status]);

  if (sessionLoading) return <LoadingState />;
  if (!session) return <SignInPrompt title="Masuk untuk melihat order" message="Setelah masuk, kamu akan melihat order yang sesuai dengan peran akunmu." />;

  const retry = () => window.location.reload();
  return <>
    <PageHeader eyebrow="Dashboard" title="Order laundry" description="Pantau order sesuai kewenangan akunmu." action={<div className="flex w-full items-center gap-2 md:w-auto"><Button variant="secondary" onClick={retry}>Sinkronkan</Button><select className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm text-black-600 focus:border-primary-400 focus:outline-none" aria-label="Filter status" value={status} onChange={(event) => { etag.current = null; cache.current = []; setStatus(event.target.value); }}><option value="">Semua status</option><option value="pending_pickup">Menunggu pickup</option><option value="processing">Diproses</option><option value="cancelled">Dibatalkan</option></select></div>} />
    {state === 'loading' && <LoadingState />}
    {state === 'empty' && <EmptyState message="Order baru akan tampil di sini." />}
    {state === 'error' && <ErrorState message={error} retry={retry} />}
    {state === 'content' && <><div className="grid gap-3">{data.orders.map((order) => <Link className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-px hover:border-primary-200" href={`/orders/${encodeURIComponent(order.id)}`} key={order.id}><div><strong>{order.id}</strong><span className="mt-1 block text-sm text-neutral-600">{order.serviceType} · {order.pickupAddress}</span></div><StatusBadge>{order.status}</StatusBadge></Link>)}</div><Freshness timestamp={data.fetchedAt} /></>}
  </>;
}
