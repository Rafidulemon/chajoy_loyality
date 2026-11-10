'use client';

/**
 * The customer app's view of the server: the signed-in customer's card, vouchers, claimed offers and the offers that are live.
 * One provider (mounted in the customer layout) loads it, and every customer screen reads it with `useWallet()`.
 *
 * How a stamp added at the counter reaches the phone (NF-04): the app asks a tiny version number every 2 seconds while the screen
 * is visible, and loads the whole wallet only when that number changes. When the new wallet has more stamps, or a new card
 * reward, the provider raises `pulse` (the stamp animation and the toast) and `unlocked` (the "Reward unlocked" dialog).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { isClaimable, type Offer, type Voucher } from './data';
import type { MeDto, WalletDto } from './contracts/dto';
import { api } from './api/client';
import { toOffer, toVoucher } from './api/adapters';

/** Marks the latest stamp so the card can animate it and the shell can show a toast. */
export type Pulse = { id: number; at: number; count: number; after: number; filled: boolean };

type WalletValue = {
  /** False until the first answer from the server: screens show a placeholder instead of an empty card. */
  ready: boolean;
  me: MeDto | null;
  /** What the member sees on the card: "CJ-000123". Not secret and not used to sign in. */
  memberCode: string;
  stamps: number;
  visits: number;
  /** Stamps earned over the customer's lifetime. */
  lifetime: number;
  /** Rewards earned over the customer's lifetime. */
  earned: number;
  vouchers: Voucher[];
  readyVouchers: Voucher[];
  /** Ids of the offers this customer already claimed. */
  claimed: string[];
  /** Offers management has published and not paused. */
  offers: Offer[];
  /** Offers that can be claimed but have not been yet. */
  unclaimed: number;
  /** Bumps on every change that adds stamps, so the card can animate. */
  card: WalletDto['card'] | null;
  pulse: Pulse | null;
  /** The id of the voucher a just-completed card produced, until the customer closes the dialog. */
  unlocked: string | null;
  claimOffer: (offer: Offer) => Promise<void>;
  dismissUnlock: () => void;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletValue | null>(null);

const memberCode = (no: number) => `CJ-${String(no).padStart(6, '0')}`;

export function WalletProvider({ children }: { children: ReactNode }) {
  const { data, mutate } = useSWR<WalletDto>('/api/me/wallet', { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true });
  // Every 2 seconds while the screen is visible: a stamp shows within the 3 seconds the business documentation asks for (NF-04).
  const { data: version } = useSWR<{ v: string }>('/api/me/version', { refreshInterval: 2000, revalidateOnFocus: true, dedupingInterval: 1000 });
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [unlocked, setUnlocked] = useState<string | null>(null);

  // Load the wallet again when the version number moves.
  const lastVersion = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!version) return;
    if (lastVersion.current !== undefined && lastVersion.current !== version.v) void mutate();
    lastVersion.current = version.v;
  }, [version, mutate]);

  // Share the program the wallet came with, so every screen's card follows a change at once.
  const { mutate: setProgram } = useSWR('/api/program', null, { revalidateOnMount: false });
  useEffect(() => {
    if (data) void setProgram(data.program, { revalidate: false });
  }, [data?.program, setProgram]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compare each new wallet with the one before it to see what just happened.
  const previous = useRef<WalletDto | null>(null);
  useEffect(() => {
    if (!data) return;
    const before = previous.current;
    previous.current = data;
    if (!before || before.me.id !== data.me.id) return;
    const gained = data.card.lifetimeStamps - before.card.lifetimeStamps;
    const fresh = data.vouchers.filter((v) => v.origin === 'card' && !before.vouchers.some((b) => b.id === v.id));
    if (gained > 0 || fresh.length > 0) {
      const filled = fresh.length > 0;
      setPulse((p) => ({ id: (p?.id ?? 0) + 1, at: Date.now(), count: Math.max(gained, 0), after: filled ? data.program.total : data.card.stamps, filled }));
      if (filled) setUnlocked(fresh[0].id);
    }
  }, [data]);

  const claimOffer = useCallback(
    async (offer: Offer) => {
      await api.post(`/api/me/offers/${offer.id}/claim`);
      await mutate();
    },
    [mutate],
  );
  const dismissUnlock = useCallback(() => setUnlocked(null), []);
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const value = useMemo<WalletValue>(() => {
    const now = Date.now();
    const vouchers = (data?.vouchers ?? []).map((v) => toVoucher(v, now));
    const offers = (data?.offers ?? []).map((o) => toOffer(o, data?.me.birthday ?? null, now));
    const claimed = data?.claimedOfferIds ?? [];
    return {
      ready: !!data,
      me: data?.me ?? null,
      memberCode: data ? memberCode(data.me.memberNo) : '',
      stamps: data?.card.stamps ?? 0,
      visits: data?.card.visits ?? 0,
      lifetime: data?.card.lifetimeStamps ?? 0,
      earned: data?.card.rewardsEarned ?? 0,
      vouchers,
      readyVouchers: vouchers.filter((v) => v.status === 'ready'),
      claimed,
      offers,
      unclaimed: offers.filter((o) => isClaimable(o) && !claimed.includes(o.id)).length,
      card: data?.card ?? null,
      pulse,
      unlocked,
      claimOffer,
      dismissUnlock,
      refresh,
    };
  }, [data, pulse, unlocked, claimOffer, dismissUnlock, refresh]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
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

/**
 * A member QR that changes every minute (NF-07). Returns the text to put in the QR code, or null until the first one arrives.
 * A screenshot of it stops working after 90 seconds, so it cannot be used to collect stamps later.
 */
export function useMemberQr(): string | null {
  const { data } = useSWR<{ token: string; expiresAt: string; refreshInSec: number }>('/api/me/qr', {
    refreshInterval: (d) => (d?.refreshInSec ?? 60) * 1000,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  return data?.token ?? null;
}
