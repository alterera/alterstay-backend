import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PricingService, TAX_RATE } from './pricing.service';
import { RatePriceLike, ResolvedNightlyRate } from './pricing.types';

const utc = (day: string) => new Date(`2026-09-${day}T00:00:00.000Z`);

function price(
  day: string,
  basePrice: number,
  overrides: Partial<RatePriceLike> = {},
): RatePriceLike {
  return {
    date: utc(day),
    basePrice,
    currency: 'INR',
    minStay: null,
    maxStay: null,
    closedToArrival: false,
    closedToDeparture: false,
    ...overrides,
  };
}

function resolved(
  day: string,
  barPrice: number,
  finalPrice = barPrice,
): ResolvedNightlyRate {
  return {
    date: utc(day),
    barPrice,
    finalPrice,
    adjustments: [],
  };
}

describe('PricingService', () => {
  let pricing: PricingService;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    pricing = new PricingService(config);
  });

  describe('estimateGst', () => {
    it('applies the flat tax rate', () => {
      expect(pricing.estimateGst(2200)).toBe(Math.round(2200 * TAX_RATE));
      expect(pricing.estimateGst(2200)).toBe(396);
    });
  });

  describe('matchNights', () => {
    it('orders prices to match the requested nights', () => {
      const nights = [utc('12'), utc('10'), utc('11')];
      const prices = [price('10', 100), price('11', 200), price('12', 300)];

      const ordered = pricing.matchNights(prices, nights);
      expect(ordered?.map((p) => p.basePrice)).toEqual([300, 100, 200]);
    });
  });

  describe('computeQuote', () => {
    it('sums nightly rates, GST on subtotal, and flat platform fee', () => {
      const quote = pricing.computeQuote(
        [resolved('10', 1000), resolved('11', 1200)],
        1,
        { platformFeeAmount: 262 },
      );

      expect(quote.subtotal).toBe(2200);
      expect(quote.gstAmount).toBe(396);
      expect(quote.platformFee).toBe(262);
      expect(quote.taxAmount).toBe(658);
      expect(quote.totalAmount).toBe(2858);
    });

    it('multiplies subtotal by rooms but keeps platform fee flat', () => {
      const quote = pricing.computeQuote([resolved('10', 3500)], 2, {
        platformFeeAmount: 262,
      });

      expect(quote.subtotal).toBe(7000);
      expect(quote.platformFee).toBe(262);
      expect(quote.gstAmount).toBe(Math.round(7000 * TAX_RATE));
    });
  });

  describe('quoteFromRoomTypeRates', () => {
    it('returns null when nights are missing', () => {
      const result = pricing.quoteFromRoomTypeRates(
        [price('10', 1000)],
        [utc('10'), utc('11')],
        1,
        'EP_REFUNDABLE',
      );
      expect(result).toBeNull();
    });

    it('applies weekend and breakfast product pricing', () => {
      const result = pricing.quoteFromRoomTypeRates(
        [price('11', 1000)],
        [utc('11')],
        1,
        'CP_REFUNDABLE',
        {
          version: 1,
          weekendDays: [5],
          weekendMultiplier: 1.2,
          minNightlyPrice: null,
          maxNightlyPrice: null,
          platformFeeAmount: 262,
          breakfastUpliftPerNight: 400,
          nonRefundableDiscountPercent: 10,
        },
      );

      expect(result?.subtotal).toBe(1600);
    });

    it('applies non-refundable discount on EP_NON_REFUNDABLE', () => {
      const result = pricing.quoteFromRoomTypeRates(
        [price('10', 1000)],
        [utc('10')],
        1,
        'EP_NON_REFUNDABLE',
        {
          version: 1,
          weekendDays: [5, 6],
          weekendMultiplier: 1.15,
          minNightlyPrice: null,
          maxNightlyPrice: null,
          platformFeeAmount: 262,
          breakfastUpliftPerNight: 400,
          nonRefundableDiscountPercent: 10,
        },
      );

      expect(result?.subtotal).toBe(900);
    });
  });

  describe('applyCoinRedemption', () => {
    it('recalculates GST but keeps platform fee', () => {
      const base = pricing.computeQuote([resolved('10', 3000)], 1, {
        platformFeeAmount: 262,
      });
      const updated = pricing.applyCoinRedemption(base, 500);

      expect(updated.subtotal).toBe(2500);
      expect(updated.gstAmount).toBe(450);
      expect(updated.platformFee).toBe(262);
      expect(updated.totalAmount).toBe(3212);
    });
  });

  describe('loadAndQuote', () => {
    it('loads room-type BAR and property config', async () => {
      const nights = [utc('08'), utc('09')];
      const rows = [price('08', 1000), price('09', 1200)];
      const client = {
        ratePlan: {
          findUnique: jest.fn().mockResolvedValue({
            roomTypeId: 'rt-1',
            productCode: 'EP_REFUNDABLE',
            property: { pricingConfigJson: { platformFeeAmount: 100 } },
          }),
        },
        roomTypeDailyRate: { findMany: jest.fn().mockResolvedValue(rows) },
      } as unknown as Parameters<PricingService['loadAndQuote']>[0];

      const quote = await pricing.loadAndQuote(client, 'rate-1', nights, 2);

      expect(quote.subtotal).toBe(4400);
      expect(quote.platformFee).toBe(100);
      expect(client.roomTypeDailyRate.findMany).toHaveBeenCalled();
    });

    it('throws when pricing is incomplete', async () => {
      const client = {
        ratePlan: {
          findUnique: jest.fn().mockResolvedValue({
            roomTypeId: 'rt-1',
            productCode: 'EP_REFUNDABLE',
            property: { pricingConfigJson: null },
          }),
        },
        roomTypeDailyRate: {
          findMany: jest.fn().mockResolvedValue([price('10', 100)]),
        },
      } as unknown as Parameters<PricingService['loadAndQuote']>[0];

      await expect(
        pricing.loadAndQuote(client, 'rate-1', [utc('10'), utc('11')], 1),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
