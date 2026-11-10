'use client';

/**
 * The cashier app's view of the server: who is working, the customer on screen, today's counters and the customer search,
 * plus the small helpers the counter screens share (idempotency keys, the camera QR scanner, and bilingual messages for the
 * few errors that need more than the general text in ./messages). Screens read with these hooks and write with `api` from ./client.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate } from 'swr';
import type { CashierCustomerDto, CustomerRowDto, StampResultDto, StaffMeDto, StaffRoleDto, TodayDto } from '@/lib/contracts/dto';
import { dailyRoom } from '@/lib/domain/rules';
import { avatarColor, initialOf } from '@/lib/format';
import type { Text } from '@/lib/i18n';
import { toFeedLine } from './adapters';
import { isApiError, withQuery } from './client';
import { errorText, isSignedOut } from './messages';

const t = (bn: string, en: string): Text => ({ bn, en });

// ---------------------------------------------------------------------------------------------
// Keys and data
// ---------------------------------------------------------------------------------------------

/** The SWR key of each cashier read, so a screen that writes can refresh exactly what it changed. */
export const cashierKeys = {
  me: '/api/cashier/me',
  today: '/api/cashier/today',
  customer: (id: string) => `/api/cashier/customers/${id}`,
  /** An empty `q` is the list of customers served at this outlet today. */
  customers: (q: string) => withQuery('/api/cashier/customers', { q: q || undefined }),
};

export type CustomerListDto = { mode: 'search' | 'today'; items: CustomerRowDto[] };

const ROLES: Record<StaffRoleDto, Text> = {
  cashier: t('ক্যাশিয়ার', 'Cashier'),
  manager: t('ম্যানেজার', 'Manager'),
  owner: t('মালিক', 'Owner'),
};

export const roleLabel = (role: StaffRoleDto): Text => ROLES[role];

/** What the member sees on their card: "CJ-000123". The same format the customer app shows. */
export const memberCode = (no: number) => `CJ-${String(no).padStart(6, '0')}`;

/** The signed-in staff member and the outlet this session works at. `me` stays null until the first answer, so nothing is shown in its place. */
export function useCashierMe() {
  const { data, error, isLoading } = useSWR<StaffMeDto>(cashierKeys.me, { revalidateOnFocus: false });
  return {
    me: data ?? null,
    loading: isLoading,
    failed: !data && !!error,
    /** Managers and owners can go over the daily limit and open the management app; a cashier needs a manager's PIN for the limit. */
    isManagement: !!data && data.role !== 'cashier',
  };
}

/** One customer as the cashier sees them: card, what is allowed today, vouchers waiting. `notFound` for an id nobody has. */
export function useCashierCustomer(id: string | undefined) {
  const { data, error, isLoading, mutate: reload } = useSWR<CashierCustomerDto>(id ? cashierKeys.customer(id) : null);
  return {
    customer: data,
    error,
    loading: isLoading,
    notFound: !data && isApiError(error) && (error.status === 404 || error.status === 400),
    refresh: async () => {
      await reload();
    },
  };
}

/** A row of the Today list: the feed line the adapters build, with the avatar the list draws. */
export type FeedLine = ReturnType<typeof toFeedLine> & { initial: Text; avatar: string };

/** Today's counters and latest transactions at this outlet. Refreshes every 15 seconds while the screen is visible. */
export function useToday() {
  const { data, error, isLoading } = useSWR<TodayDto>(cashierKeys.today, { refreshInterval: 15_000 });
  const feed = useMemo<FeedLine[]>(() => {
    const now = Date.now();
    return (data?.feed ?? []).map((f) => ({ ...toFeedLine(f, now), initial: initialOf(f.customer.name), avatar: avatarColor(f.customer.id) }));
  }, [data]);
  return {
    /** False until the first answer, so a counter can show a dash instead of a misleading 0. */
    ready: !!data,
    loading: isLoading,
    failed: !data && !!error,
    stats: { stamps: data?.stamps ?? 0, rewards: data?.rewards ?? 0, newCustomers: data?.newCustomers ?? 0, cancelled: data?.cancelled ?? 0 },
    feed,
  };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
/** Only the digits of what was typed, Bangla digits turned into Western ones: "০১৭১২-৩৪৫৬৭৮" -> "01712345678". */
export const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/\D/g, '');

export type SearchKind =
  /** Nothing typed: the server lists the customers served here today. */
  | 'today'
  /** A number with fewer than 4 digits: the server would answer nothing, so nothing is asked. */
  | 'short-number'
  /** One letter: too little to search a name. */
  | 'short-name'
  /** Enough to search: a number of 4 or more digits, or a name of 2 or more letters. */
  | 'search';

/** What the cashier typed in a customer search, by the same rules the server applies: a number needs 4 digits, a name 2 letters. */
export function classifySearch(raw: string): { kind: SearchKind; q: string } {
  const q = raw.trim();
  if (!q) return { kind: 'today', q };
  if (/^[\d\s+\-০-৯]+$/.test(q)) return { kind: asciiDigits(q).length >= 4 ? 'search' : 'short-number', q };
  return { kind: Array.from(q).length >= 2 ? 'search' : 'short-name', q };
}

/**
 * The Customers tab: the customers served at this outlet today, or the search results once a search is typed. The search waits
 * for a pause in typing. While what is typed is still too short to search, today's list stays up and `kind` says why nothing
 * is searched yet. `items` only ever holds the answer to what is on screen now, never the previous search.
 */
export function useCustomerList(raw: string, debounceMs = 300) {
  const typed = classifySearch(raw);
  const debounced = useDebounced(raw, debounceMs);
  const settled = classifySearch(debounced);
  const showing: CustomerListDto['mode'] = typed.kind === 'search' ? 'search' : 'today';
  const settledShowing: CustomerListDto['mode'] = settled.kind === 'search' ? 'search' : 'today';
  // No `keepPreviousData`: while a new search loads there is nothing to show, never the last search's people.
  const { data, error, mutate: reload } = useSWR<CustomerListDto>(settledShowing === 'search' ? cashierKeys.customers(settled.q) : cashierKeys.customers(''), {
    refreshInterval: settledShowing === 'today' ? 30_000 : 0,
  });
  // Only an answer that has caught up with what is typed counts (the search waits for a pause in typing).
  const waiting = showing !== settledShowing || (showing === 'search' && typed.q !== settled.q);
  const live = !!data && !waiting && data.mode === showing;
  return {
    kind: typed.kind,
    /** Whether the list is today's customers or search results. */
    showing,
    items: live ? (data?.items ?? []) : [],
    loading: !live && !error,
    failed: !!error && !live,
    retry: async () => {
      await reload();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------------------------

/**
 * A fresh key for one stamp request (CA-20). `crypto.randomUUID` only exists on secure pages (https or localhost), and a
 * counter tablet may open the app over plain http on the shop network, so fall back to a UUID built from random bytes.
 */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** A network failure or a 5xx: the server may or may not have applied the request, so a retry has to reuse the same idempotency key. */
export const isUncertain = (e: unknown) => !isApiError(e) || e.code === 'NETWORK' || e.status >= 500;

/** The cashier's customer view after a stamp or an undo, built from the answer so the card is right at once. The screen then reloads it from the server. */
export function applyStampResult(cur: CashierCustomerDto, res: StampResultDto): CashierCustomerDto {
  const room = dailyRoom(cur.program.dailyLimit, res.givenToday);
  const added = res.vouchers.filter((v) => v.status === 'ready' && !cur.readyVouchers.some((r) => r.id === v.id));
  const readyVouchers = [...cur.readyVouchers, ...added];
  return {
    ...cur,
    customer: {
      ...cur.customer,
      stamps: res.card.stamps,
      visits: res.card.visits,
      rewardsEarned: res.card.rewardsEarned,
      lastVisitAt: res.card.lastVisitAt,
      hasReadyVoucher: readyVouchers.length > 0,
    },
    card: res.card,
    givenToday: res.givenToday,
    roomToday: Number.isFinite(room) ? room : null,
    readyVouchers,
  };
}

// ---------------------------------------------------------------------------------------------
// Messages for errors that need to say more than the general text
// ---------------------------------------------------------------------------------------------

/**
 * Call this from the catch block of a write. A failed read of a signed-out session already sends the person to the sign-in
 * screen (see provider.tsx); this makes a failed write do the same, by asking again who is signed in, which fails the same way.
 */
export function checkSignedOut(e: unknown) {
  if (isSignedOut(e)) void mutate(cashierKeys.me);
}

/** The voucher lookup answers NOT_FOUND for a code nobody has. */
export function voucherLookupError(e: unknown): Text {
  if (isApiError(e) && (e.code === 'NOT_FOUND' || e.code === 'VOUCHER_NOT_FOUND')) return t('এই কোডের কোনো ভাউচার নেই', 'No voucher with that code');
  return errorText(e);
}

/** A member QR is signed and only good for about 90 seconds (NF-07), so a refused one almost always just needs refreshing on the customer's phone. */
export function scanError(e: unknown): Text {
  if (isApiError(e) && e.code === 'VALIDATION') {
    return t('এই QR কোডটি আর চলবে না। গ্রাহককে QR রিফ্রেশ করতে বলুন (এটি প্রায় ৯০ সেকেন্ড চলে)।', 'This QR code is no longer valid. Ask the customer to refresh it; it only works for about 90 seconds.');
  }
  if (isApiError(e) && e.code === 'NOT_FOUND') return t('এই QR-এর গ্রাহককে পাওয়া যায়নি।', 'No customer was found for this QR code.');
  return errorText(e);
}

// ---------------------------------------------------------------------------------------------
// Camera QR scanner
// ---------------------------------------------------------------------------------------------

/** The text inside the QR codes the customer app shows: a signed member token, and "chajoy:voucher:<code>" on a voucher. */
export const QR_PREFIX = { member: 'CJ1.', voucher: 'chajoy:voucher:' } as const;

// BarcodeDetector is not in TypeScript's DOM types, so only the part used here is described.
type QrDetector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (options?: { formats?: string[] }): QrDetector; getSupportedFormats?: () => Promise<string[]> };
const detectorCtor = () => (typeof window === 'undefined' ? undefined : (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector);

function cameraProblem(e: unknown): Text {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return t('ক্যামেরার অনুমতি দেওয়া হয়নি। ব্রাউজারের সেটিংসে ক্যামেরা চালু করুন, অথবা মোবাইল নম্বর দিয়ে খুঁজুন।', 'Camera permission was not given. Allow the camera in your browser settings, or search by mobile number.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('এই ডিভাইসে কোনো ক্যামেরা পাওয়া যায়নি।', 'No camera was found on this device.');
  return t('ক্যামেরা চালু করা যায়নি। আবার চেষ্টা করুন।', 'The camera could not be started. Try again.');
}

export type ScannerState =
  /** Not known yet: whether the browser can scan is only checked after the page has loaded. */
  | 'checking'
  | 'unsupported'
  | 'idle'
  | 'starting'
  | 'scanning';

/**
 * Reads QR codes with the rear camera through the browser's BarcodeDetector. It never asks for the camera by itself: `start()` is
 * called from a button. Every QR it sees goes to `onCode`; return true when the code was used (the camera then stops) and false to
 * keep looking. The camera is released when scanning ends, when the tab is hidden and when the screen goes away.
 */
export function useQrScanner(onCode: (value: string) => boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  /** Changes on every start and stop, so a camera prompt or a detection loop from an earlier run ends quietly. */
  const runRef = useRef(0);
  const activeRef = useRef(false);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<ScannerState>('checking');
  const [error, setError] = useState<Text | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  });

  // Can this browser scan at all? Checked after mount, so the server's page and the first client render agree.
  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    let alive = true;
    (async () => {
      try {
        const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : ['qr_code'];
        if (alive) setState(formats.includes('qr_code') ? 'idle' : 'unsupported');
      } catch {
        if (alive) setState('unsupported');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const release = useCallback(() => {
    runRef.current += 1;
    activeRef.current = false;
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const stop = useCallback(() => {
    release();
    setState((s) => (s === 'starting' || s === 'scanning' ? 'idle' : s));
  }, [release]);

  const start = useCallback(async () => {
    const Ctor = detectorCtor();
    if (!Ctor || activeRef.current) return;
    activeRef.current = true;
    const run = ++runRef.current;
    setError(null);
    setState('starting');
    try {
      const detector = new Ctor({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (run !== runRef.current) {
        // Stopped, or the screen left, while the browser was asking for permission.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('no video element');
      video.srcObject = stream;
      await video.play();
      if (run !== runRef.current) return;
      setState('scanning');

      const tick = async () => {
        if (run !== runRef.current) return;
        try {
          if (video.readyState >= 2) {
            const hits = await detector.detect(video);
            if (run !== runRef.current) return;
            for (const hit of hits) {
              if (hit.rawValue && onCodeRef.current(hit.rawValue)) {
                release();
                setState('idle');
                return;
              }
            }
          }
        } catch {
          // A frame that cannot be read is skipped; the next one is tried.
        }
        timerRef.current = window.setTimeout(tick, 250);
      };
      void tick();
    } catch (e) {
      if (run !== runRef.current) return;
      release();
      setState('idle');
      setError(cameraProblem(e));
    }
  }, [release]);

  // Let go of the camera when the screen goes away, and when the tab is hidden (the browser pauses the picture anyway).
  useEffect(() => release, [release]);
  useEffect(() => {
    if (state !== 'scanning') return;
    const onHidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [state, stop]);

  return { videoRef, state, error, start, stop };
}
