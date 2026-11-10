import type { ReactNode } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { WalletProvider } from '@/lib/wallet';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <CustomerShell>{children}</CustomerShell>
    </WalletProvider>
  );
}
