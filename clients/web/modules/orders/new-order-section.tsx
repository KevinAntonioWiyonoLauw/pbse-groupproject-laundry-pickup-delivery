'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { authenticatedRequest } from '../../src/lib/auth';
import { ApiError } from '../../src/lib/api';
import { apiMessage } from '../../src/lib/error-message';
import { type Order } from '../../src/lib/models';
import { useSession } from '../../src/lib/use-session';
import { Button } from '../../components/ui/button';
import { LoadingState } from '../../components/ui/loading-state';
import { SignInPrompt } from '../../components/ui/sign-in-prompt';
import { PageHeader } from '../../components/ui/page-header';
import { useRouter } from 'next/navigation';

export default function NewOrderPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [message, setMessage] = useState('');
  const idempotencyKey = useRef<string | null>(null);
  if (loading) return <LoadingState />;
  if (!session) return <SignInPrompt title="Masuk untuk membuat order" message="Customer dapat membuat order baru setelah berhasil masuk." />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { customerId: typeof session.claims.fixture_domain_id === 'string' ? session.claims.fixture_domain_id : String(session.claims.sub ?? ''), serviceType: String(data.get('serviceType')), weightKg: Number(data.get('weightKg')), pickupAddress: String(data.get('pickupAddress')) };
    if (!body.customerId || !body.weightKg || body.weightKg < 0.1 || body.pickupAddress.trim().length < 5) { setMessage('Periksa semua field sebelum mengirim.'); return; }
    idempotencyKey.current ??= crypto.randomUUID();
    setMessage('Mengirim order...');
    try { const result = await authenticatedRequest<Order>('/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey.current }, body: JSON.stringify(body) }); idempotencyKey.current = null; if (result.data?.id) router.push(`/orders/${encodeURIComponent(result.data.id)}`); }
    catch (requestError) { const error = requestError instanceof ApiError && (requestError.status === 400 || requestError.status === 422) ? requestError.problem?.detail ?? requestError.message : apiMessage(requestError); setMessage(error); }
  };

  return <><PageHeader eyebrow="Customer" title="Order baru" description="Isi data pickup, lalu konfirmasi sekali." action={<Link href="/orders" className="text-sm font-bold text-primary-600">← Semua order</Link>} /><form className="grid max-w-2xl gap-5 rounded-2xl border border-neutral-200 bg-white p-7" onSubmit={(event) => void submit(event)}><label className="grid gap-1.5 font-bold">Jenis layanan<select className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-black-600 focus:border-primary-400 focus:outline-none" name="serviceType" required><option value="wash_fold">Wash & fold</option><option value="dry_clean">Dry clean</option></select></label><label className="grid gap-1.5 font-bold">Berat (kg)<input className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-black-600 focus:border-primary-400 focus:outline-none" name="weightKg" type="number" min="0.1" step="0.1" required /></label><label className="grid gap-1.5 font-bold">Alamat pickup<textarea className="min-h-28 resize-y rounded-xl border border-neutral-300 bg-white px-3 py-3 text-black-600 focus:border-primary-400 focus:outline-none" name="pickupAddress" minLength={5} required /></label><p className="min-h-5 text-sm text-red-400" role="alert">{message}</p><Button type="submit">Konfirmasi order</Button></form></>;
}
