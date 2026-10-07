import type { PricingConfigV1 } from './pricing-config.schema';
import type { PriceAdjustment, RatePriceLike, ResolvedNightlyRate } from './pricing.types';

export type ResolveNightInput = {
  date: Date;
  barPrice: number;
  config: PricingConfigV1;
};

export class DynamicPricingEngine {
  resolveNight(input: ResolveNightInput): ResolvedNightlyRate {
    const { date, barPrice, config } = input;
    const adjustments: PriceAdjustment[] = [];
    let finalPrice = barPrice;

    const dayOfWeek = date.getUTCDay();
    if (config.weekendDays.includes(dayOfWeek)) {
      const before = finalPrice;
      finalPrice = Math.round(finalPrice * config.weekendMultiplier);
      adjustments.push({
        code: 'weekend',
        label: 'Weekend rate',
        multiplier: config.weekendMultiplier,
        amountDelta: finalPrice - before,
      });
    }

    if (config.minNightlyPrice !== null && finalPrice < config.minNightlyPrice) {
      const before = finalPrice;
      finalPrice = config.minNightlyPrice;
      adjustments.push({
        code: 'floor',
        label: 'Minimum nightly rate',
        amountDelta: finalPrice - before,
      });
    }

    if (config.maxNightlyPrice !== null && finalPrice > config.maxNightlyPrice) {
      const before = finalPrice;
      finalPrice = config.maxNightlyPrice;
      adjustments.push({
        code: 'ceiling',
        label: 'Maximum nightly rate',
        amountDelta: finalPrice - before,
      });
    }

    return {
      date,
      barPrice,
      finalPrice,
      adjustments,
    };
  }

  resolveStay(
    prices: RatePriceLike[],
    config: PricingConfigV1,
  ): ResolvedNightlyRate[] {
    return prices.map((price) =>
      this.resolveNight({
        date: price.date,
        barPrice: Number(price.basePrice),
        config,
      }),
    );
  }
}
