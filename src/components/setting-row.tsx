'use client';

import type { ReactNode } from 'react';
import { Switch } from './ui';

export function SwitchRow({ icon, color, label, sub, checked, onChange }: { icon: ReactNode; color: string; label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-16 items-center gap-3 border-t border-line py-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-navy" style={{ background: color }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
