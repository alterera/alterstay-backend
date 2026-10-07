import { DEFAULT_PRICING_CONFIG } from './pricing-config.schema';
import { RateProductEngine } from './rate-product.engine';

const utc = (day: string) => new Date(`2026-09-${day}T00:00:00.000Z`);

describe('RateProductEngine', () => {
  const engine = new RateProductEngine();

  it('applies breakfast uplift for CP products', () => {
    const result = engine.applyProduct(
      [{ date: utc('10'), barPrice: 1000, finalPrice: 1000, adjustments: [] }],
      'CP_REFUNDABLE',
      { ...DEFAULT_PRICING_CONFIG, breakfastUpliftPerNight: 400 },
    );

    expect(result[0].finalPrice).toBe(1400);
    expect(result[0].adjustments.some((a) => a.code === 'meal_plan')).toBe(true);
  });

  it('applies non-refundable discount', () => {
    const result = engine.applyProduct(
      [{ date: utc('10'), barPrice: 1000, finalPrice: 1000, adjustments: [] }],
      'EP_NON_REFUNDABLE',
      { ...DEFAULT_PRICING_CONFIG, nonRefundableDiscountPercent: 10 },
    );

    expect(result[0].finalPrice).toBe(900);
  });

  it('applies half board uplift for HB products', () => {
    const result = engine.applyProduct(
      [{ date: utc('10'), barPrice: 1000, finalPrice: 1000, adjustments: [] }],
      'HB_REFUNDABLE',
      { ...DEFAULT_PRICING_CONFIG, halfBoardUpliftPerNight: 800 },
    );

    expect(result[0].finalPrice).toBe(1800);
  });

  it('applies full board uplift for FB products', () => {
    const result = engine.applyProduct(
      [{ date: utc('10'), barPrice: 1000, finalPrice: 1000, adjustments: [] }],
      'FB_REFUNDABLE',
      { ...DEFAULT_PRICING_CONFIG, fullBoardUpliftPerNight: 1200 },
    );

    expect(result[0].finalPrice).toBe(2200);
  });
});
