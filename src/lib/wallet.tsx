'use client';

/**
 * The customer app's view of the shared store (lib/store.tsx): the signed-in demo customer's card, vouchers,
 * claimed offers and activity, plus the offers management currently has live.
 */

import { useEffect, useMemo, useState } from 'react';
import { isClaimable, type Offer } from './data';
import { DEMO_CUSTOMER, useStore } from './store';

export { DEMO_CUSTOMER };

export function useWallet() {
  const store = useStore();
  const card = store.cards[DEMO_CUSTOMER];
  const { offers, pulse, unlocked, claimOffer, redeem, dismissUnlock } = store;

  return useMemo(() => {
    const live = offers.filter((o) => o.status === 'live');
    return {
      ...card,
      pulse,
      unlocked,
      /** Offers management has published and not paused. */
      offers: live,
      readyVouchers: card.vouchers.filter((v) => v.status === 'ready'),
      /** Offers that can be claimed but have not been yet. */
      unclaimed: live.filter((o) => isClaimable(o) && !card.claimed.includes(o.id)).length,
      claimOffer: (offer: Offer) => claimOffer(DEMO_CUSTOMER, offer),
      redeem: (id: string) => redeem(DEMO_CUSTOMER, id, { bn: 'গ্রাহক', en: 'Customer' }),
      dismissUnlock,
    };
  }, [card, offers, pulse, unlocked, claimOffer, redeem, dismissUnlock]);
}

/**
 * What the card should show right now. After a new stamp it shows the card as it looked when the stamp
 * landed (a full card if that stamp completed it) for a moment, so the stamp animation is not skipped
 * when a completed card resets straight away.
 */
export function useCardView() {
  const { stamps, pulse } = useWallet();
  const [view, setView] = useState<{ collected: number; fresh: number } | null>(null);

  useEffect(() => {
    if (!pulse || Date.now() - pulse.at > 8000) return;
    setView({ collected: pulse.after, fresh: pulse.count });
    const t = setTimeout(() => setView(null), 2600);
    return () => clearTimeout(t);
  }, [pulse]);

  return view ?? { collected: stamps, fresh: 0 };
}
