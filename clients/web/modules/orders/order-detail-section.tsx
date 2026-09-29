'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedRequest, roleOf } from '../../src/lib/auth';
import { apiMessage } from '../../src/lib/error-message';
import { type Order, type Pickup } from '../../src/lib/models';
import { useSession } from '../../src/lib/use-session';
import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/error-state';
import { Freshness } from '../../components/ui/freshness';
import { LoadingState } from '../../components/ui/loading-state';
import { PageHeader } from '../../components/ui/page-header';
import { SignInPrompt } from '../../components/ui/sign-in-prompt';
import { StatusBadge } from '../../components/ui/status-badge';

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { session, loading: sessionLoading } = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  const etag = useRef<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [state, setState] = useState<'loading' | 'error' | 'content'>('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const cancellationKey = useRef<string | null>(null);
  const dispatchKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setState('loading');
    try {
      const result = await authenticatedRequest<Order>(`/orders/${encodeURIComponent(orderId)}`, { headers: etag.current ? { 'If-None-Match': etag.current } : undefined });
      if (result.status !== 304) { setOrder(result.data); etag.current = result.etag; }
      setFetchedAt(Date.now());
      setState('content');
    } catch (requestError) { setError(apiMessage(requestError)); setState('error'); }
  }, [orderId, session]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (sessionLoading) return <LoadingState />;
  if (!session) return <SignInPrompt title="Masuk untuk melihat detail order" message="Detail order hanya tersedia setelah akun berhasil masuk." />;
  if (state === 'loading' || !order) return <LoadingState />;
  if (state === 'error') return <ErrorState message={error} retry={() => void load()} />;

  const staff = roleOf(session) === 'staff';
  const customerCanCancel = roleOf(session) === 'customer' && ['pending_pickup', 'ready_for_pickup', 'confirmed'].includes(order.status);
  const claim = async () => {
    try { await authenticatedRequest<Order>(`/orders/${encodeURIComponent(order.id)}/fulfilment`, { method: 'POST', headers: etag.current ? { 'If-Match': etag.current } : undefined }); await load(); }
    catch (requestError) { setMessage(apiMessage(requestError)); }
  };
  const cancel = async () => {
    if (!window.confirm('Batalkan order ini?')) return;
    cancellationKey.current ??= crypto.randomUUID();
    try { await authenticatedRequest(`/orders/${encodeURIComponent(order.id)}/cancellation`, { method: 'POST', headers: { 'Idempotency-Key': cancellationKey.current, ...(etag.current ? { 'If-Match': etag.current } : {}) } }); cancellationKey.current = null; setMessage('Order berhasil dibatalkan.'); await load(); }
    catch (requestError) { setMessage(apiMessage(requestError)); }
  };
  const dispatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // React nulls `event.currentTarget` once the handler returns, and `await`
    // yields to the event loop before that. Reading it after the request would
    // therefore throw "Cannot read properties of null (reading 'reset')" even
    // though the pickup was created. Capture the element up front.
    const form = event.currentTarget;
    const data = new FormData(form);
    dispatchKey.current ??= crypto.randomUUID();
    try { await authenticatedRequest<Pickup>('/pickups', { method: 'POST', headers: { 'Idempotency-Key': dispatchKey.current }, body: JSON.stringify({ orderId: order.id, driverId: String(data.get('driverId')), scheduledAt: new Date(String(data.get('scheduledAt'))).toISOString() }) }); dispatchKey.current = null; setMessage('Pickup berhasil ditugaskan.'); form.reset(); }
    catch (requestError) { setMessage(apiMessage(requestError)); }
  };

  return <>
    <PageHeader eyebrow="Detail order" title={order.id} description={`Terakhir diperbarui ${new Date(order.updatedAt).toLocaleString('id-ID')}`} action={<div className="flex items-center gap-3"><Link href="/orders" className="text-sm font-bold text-primary-600">← Semua order</Link><Button variant="secondary" onClick={() => void load()}>Segarkan</Button></div>} />
    <article className="rounded-2xl border border-neutral-200 bg-white p-7"><dl className="mb-7 grid gap-4 md:grid-cols-[minmax(130px,0.4fr)_1fr]"><dt className="text-neutral-600">Status</dt><dd className="m-0"><StatusBadge>{order.status}</StatusBadge></dd><dt className="text-neutral-600">Layanan</dt><dd className="m-0">{order.serviceType}</dd><dt className="text-neutral-600">Berat</dt><dd className="m-0">{order.weightKg} kg</dd><dt className="text-neutral-600">Alamat pickup</dt><dd className="m-0">{order.pickupAddress}</dd></dl><div className="flex flex-wrap gap-3">{staff && order.status === 'pending_pickup' && <Button onClick={() => void claim()}>Terima order</Button>}{customerCanCancel && <Button variant="danger" onClick={() => void cancel()}>Batalkan order</Button>}</div><p className="min-h-5 text-sm text-red-400" role="status">{message}</p>{staff && order.status === 'processing' && <form className="mt-7 grid gap-3 border-t border-neutral-200 pt-6" onSubmit={(event) => void dispatch(event)}><h3 className="m-0 text-lg font-bold">Tugaskan pickup</h3><label className="grid gap-1.5 font-bold">ID driver<input className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-black-600 focus:border-primary-400 focus:outline-none" name="driverId" placeholder="drv_..." required /></label><label className="grid gap-1.5 font-bold">Jadwal<input className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-black-600 focus:border-primary-400 focus:outline-none" name="scheduledAt" type="datetime-local" required /></label><Button type="submit">Buat penugasan</Button></form>}<Freshness timestamp={fetchedAt} /></article>
  </>;
}
