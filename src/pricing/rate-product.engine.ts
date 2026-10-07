import type { PricingConfigV1 } from './pricing-config.schema';
import type { PriceAdjustment, ResolvedNightlyRate } from './pricing.types';
import {
  getRateProduct,
  type MealPlanCode,
  type RateProductCode,
} from './rate-product.catalog';

/**
 * Applies meal-plan uplifts and non-refundable discounts on top of
 * dynamically-adjusted BAR nights.
 */
export class RateProductEngine {
  private mealUplift(
    mealPlanCode: MealPlanCode,
    config: PricingConfigV1,
  ): number {
    switch (mealPlanCode) {
      case 'BREAKFAST':
        return Math.round(config.breakfastUpliftPerNight);
      case 'HALF_BOARD':
        return Math.round(config.halfBoardUpliftPerNight);
      case 'FULL_BOARD':
        return Math.round(config.fullBoardUpliftPerNight);
      default:
        return 0;
    }
  }

  private mealLabel(mealPlanCode: MealPlanCode): string {
    switch (mealPlanCode) {
      case 'BREAKFAST':
        return 'Breakfast included';
      case 'HALF_BOARD':
        return 'Breakfast + Dinner';
      case 'FULL_BOARD':
        return 'All meals included';
      default:
        return '';
    }
  }

  applyProduct(
    resolvedNightly: ResolvedNightlyRate[],
    productCode: RateProductCode,
    config: PricingConfigV1,
  ): ResolvedNightlyRate[] {
    const product = getRateProduct(productCode);
    if (!product) {
      throw new Error(`Unknown rate product: ${productCode}`);
    }

    return resolvedNightly.map((night) => {
      const adjustments: PriceAdjustment[] = [...night.adjustments];
      let finalPrice = night.finalPrice;

      if (product.mealPlanCode !== 'ROOM_ONLY') {
        const uplift = this.mealUplift(product.mealPlanCode, config);
        if (uplift > 0) {
          finalPrice += uplift;
          adjustments.push({
            code: 'meal_plan',
            label: this.mealLabel(product.mealPlanCode),
            amountDelta: uplift,
          });
        }
      }

      if (!product.refundable && config.nonRefundableDiscountPercent > 0) {
        const before = finalPrice;
        finalPrice = Math.round(
          before * (1 - config.nonRefundableDiscountPercent / 100),
        );
        adjustments.push({
          code: 'non_refundable',
          label: 'Non-refundable rate',
          multiplier: 1 - config.nonRefundableDiscountPercent / 100,
          amountDelta: finalPrice - before,
        });
      }

      return {
        ...night,
        finalPrice,
        adjustments,
      };
    });
  }
}
