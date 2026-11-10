'use client';

import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand';
import { Toggles } from '@/components/toggles';

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-4 md:px-10">
        <BrandLogo />
        <Toggles />
      </header>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 pb-8 md:px-10">{children}</main>
    </div>
  );
}
