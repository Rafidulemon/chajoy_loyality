import type { Offer } from './data';

/** An offer as management manages it: the offer plus whether customers can see it and how often it was claimed. */
export type OfferRow = Offer & { status: 'live' | 'paused'; claims: number };
