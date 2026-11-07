'use client';

import type { ReactNode } from 'react';
import { PageTitle } from './ui';
import { Toggles } from './toggles';

/** Page title row used on every owner page, with the language and theme switches. */
export function OwnerHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {back}
      <PageTitle
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Toggles />
            {actions}
          </>
        }
      />
    </div>
  );
}
