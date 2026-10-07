import { Quote, ResolvedNightlyRate } from '../../pricing/pricing.types';

export type SerializedNightlyRate = {
  date: string;
  barPrice: number;
  finalPrice: number;
  adjustments: ResolvedNightlyRate['adjustments'];
  /** @deprecated Legacy snapshots — use barPrice/finalPrice. */
  basePrice?: number;
};

export type SerializedQuote = Omit<Quote, 'nightly'> & {
  nightly: SerializedNightlyRate[];
};

export function serializeQuote(quote: Quote): SerializedQuote {
  return {
    ...quote,
    nightly: quote.nightly.map((night) => ({
      date: night.date.toISOString().slice(0, 10),
      barPrice: night.barPrice,
      finalPrice: night.finalPrice,
      adjustments: night.adjustments,
    })),
  };
}

export function deserializeQuote(json: SerializedQuote): Quote {
  return {
    ...json,
    nightly: json.nightly.map((night) => {
      const barPrice = night.barPrice ?? night.basePrice ?? 0;
      const finalPrice = night.finalPrice ?? night.basePrice ?? barPrice;
      return {
        date: new Date(`${night.date}T00:00:00.000Z`),
        barPrice,
        finalPrice,
        adjustments: night.adjustments ?? [],
      };
    }),
  };
}

export type QuoteNightlyResponse = {
  date: string;
  barPrice: number;
  finalPrice: number;
  adjustments: ResolvedNightlyRate['adjustments'];
};

export type QuoteResponse = {
  subtotal: number;
  gstAmount: number;
  platformFee: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  nights: number;
  rooms: number;
  available: boolean;
  remainingRooms: number;
  expiresAt: string;
  nightly?: QuoteNightlyResponse[];
  coinEarnPreview?: {
    planCode: string;
    earnPercent: number;
    earnableAmount: number;
  };
  coinsRedeemed?: number;
  /** @deprecated No checkout discount — use coinEarnPreview. */
  membershipDiscount?: {
    planCode: string;
    discountPercent: number;
    discountableAmount: number;
    discountAmount: number;
  };
};

export type BookingIntentResponse = {
  quoteToken: string;
  expiresAt: string;
  quote: QuoteResponse;
  coinsBalance?: number;
  maxCoinsRedeemable?: number;
  property: { name: string; slug: string };
  roomType: { id: string; name: string };
  ratePlan: { id: string; name: string };
};
