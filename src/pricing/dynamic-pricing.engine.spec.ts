import { DEFAULT_PRICING_CONFIG } from './pricing-config.schema';
import { DynamicPricingEngine } from './dynamic-pricing.engine';

const utc = (day: string) => new Date(`2026-09-${day}T00:00:00.000Z`);

describe('DynamicPricingEngine', () => {
  const engine = new DynamicPricingEngine();

  it('applies weekend multiplier on Friday and Saturday', () => {
    const config = {
      ...DEFAULT_PRICING_CONFIG,
      weekendMultiplier: 1.15,
      weekendDays: [5, 6],
    };

    const friday = engine.resolveNight({
      date: utc('11'),
      barPrice: 1000,
      config,
    });
    const thursday = engine.resolveNight({
      date: utc('10'),
      barPrice: 1000,
      config,
    });

    expect(friday.finalPrice).toBe(1150);
    expect(friday.adjustments[0]?.code).toBe('weekend');
    expect(thursday.finalPrice).toBe(1000);
    expect(thursday.adjustments).toHaveLength(0);
  });

  it('sums resolved nights for a multi-night stay', () => {
    const config = {
      ...DEFAULT_PRICING_CONFIG,
      weekendMultiplier: 1.15,
      weekendDays: [5, 6],
    };

    const nights = engine.resolveStay(
      [
        { date: utc('10'), basePrice: 1000 },
        { date: utc('11'), basePrice: 1000 },
      ],
      config,
    );

    expect(nights.map((n) => n.finalPrice)).toEqual([1000, 1150]);
    expect(nights.reduce((sum, n) => sum + n.finalPrice, 0)).toBe(2150);
  });

  it('enforces floor and ceiling', () => {
    const config = {
      ...DEFAULT_PRICING_CONFIG,
      weekendMultiplier: 1.1,
      minNightlyPrice: 1200,
      maxNightlyPrice: 1500,
    };

    const low = engine.resolveNight({
      date: utc('10'),
      barPrice: 1000,
      config,
    });
    const high = engine.resolveNight({
      date: utc('11'),
      barPrice: 2000,
      config,
    });

    expect(low.finalPrice).toBe(1200);
    expect(high.finalPrice).toBe(1500);
  });
});
