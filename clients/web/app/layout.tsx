import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Navbar from '../components/navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Laundry Pickup & Delivery',
  description: 'PBSE Group Project - Laundry Pickup & Delivery',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16">{children}</main>
      </body>
    </html>
  );
}
