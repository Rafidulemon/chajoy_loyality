import type { ReactNode } from 'react';
import { CashierShell } from '@/components/cashier-shell';

export default function CashierLayout({ children }: { children: ReactNode }) {
  return <CashierShell>{children}</CashierShell>;
}
