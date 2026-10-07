import { BadRequestException } from '@nestjs/common';
import {
  normalizeEnabledProductCodes,
  type RateProductCode,
} from './rate-product.catalog';

export const PRICING_CONFIG_VERSION = 1;

export type PricingConfigV1 = {
  version: 1;
  weekendDays: number[];
  weekendMultiplier: number;
  minNightlyPrice: number | null;
  maxNightlyPrice: number | null;
  platformFeeAmount: number;
  breakfastUpliftPerNight: number;
  halfBoardUpliftPerNight: number;
  fullBoardUpliftPerNight: number;
  nonRefundableDiscountPercent: number;
  enabledProductCodes: RateProductCode[];
};

export const DEFAULT_PRICING_CONFIG: PricingConfigV1 = {
  version: 1,
  weekendDays: [5, 6],
  weekendMultiplier: 1.15,
  minNightlyPrice: null,
  maxNightlyPrice: null,
  platformFeeAmount: 262,
  breakfastUpliftPerNight: 400,
  halfBoardUpliftPerNight: 800,
  fullBoardUpliftPerNight: 1200,
  nonRefundableDiscountPercent: 10,
  enabledProductCodes: [
    'EP_REFUNDABLE',
    'EP_NON_REFUNDABLE',
    'CP_REFUNDABLE',
    'CP_NON_REFUNDABLE',
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw new BadRequestException(
      'minNightlyPrice and maxNightlyPrice must be non-negative integers or null',
    );
  }
  return num;
}

function parseUplift(value: unknown, field: string, fallback: number): number {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num) || num < 0) {
    throw new BadRequestException(`${field} must be a non-negative number`);
  }
  return Math.round(num);
}

export function parsePricingConfig(raw: unknown): PricingConfigV1 {
  if (raw === null || raw === undefined) {
    return { ...DEFAULT_PRICING_CONFIG };
  }

  if (!isRecord(raw)) {
    throw new BadRequestException('pricingConfigJson must be an object');
  }

  const version = raw.version ?? PRICING_CONFIG_VERSION;
  if (version !== PRICING_CONFIG_VERSION) {
    throw new BadRequestException(
      `Unsupported pricing config version: ${version}`,
    );
  }

  const weekendDays = raw.weekendDays ?? DEFAULT_PRICING_CONFIG.weekendDays;
  if (
    !Array.isArray(weekendDays) ||
    weekendDays.length === 0 ||
    !weekendDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  ) {
    throw new BadRequestException(
      'weekendDays must be an array of integers 0-6',
    );
  }

  const weekendMultiplier = Number(
    raw.weekendMultiplier ?? DEFAULT_PRICING_CONFIG.weekendMultiplier,
  );
  if (!Number.isFinite(weekendMultiplier) || weekendMultiplier <= 0) {
    throw new BadRequestException('weekendMultiplier must be a positive number');
  }

  const platformFeeAmount = Number(
    raw.platformFeeAmount ?? DEFAULT_PRICING_CONFIG.platformFeeAmount,
  );
  if (!Number.isFinite(platformFeeAmount) || platformFeeAmount < 0) {
    throw new BadRequestException(
      'platformFeeAmount must be a non-negative number',
    );
  }

  const breakfastUpliftPerNight = parseUplift(
    raw.breakfastUpliftPerNight,
    'breakfastUpliftPerNight',
    DEFAULT_PRICING_CONFIG.breakfastUpliftPerNight,
  );
  const halfBoardUpliftPerNight = parseUplift(
    raw.halfBoardUpliftPerNight,
    'halfBoardUpliftPerNight',
    DEFAULT_PRICING_CONFIG.halfBoardUpliftPerNight,
  );
  const fullBoardUpliftPerNight = parseUplift(
    raw.fullBoardUpliftPerNight,
    'fullBoardUpliftPerNight',
    DEFAULT_PRICING_CONFIG.fullBoardUpliftPerNight,
  );

  const nonRefundableDiscountPercent = Number(
    raw.nonRefundableDiscountPercent ??
      DEFAULT_PRICING_CONFIG.nonRefundableDiscountPercent,
  );
  if (
    !Number.isFinite(nonRefundableDiscountPercent) ||
    nonRefundableDiscountPercent < 0 ||
    nonRefundableDiscountPercent > 100
  ) {
    throw new BadRequestException(
      'nonRefundableDiscountPercent must be between 0 and 100',
    );
  }

  const minNightlyPrice = parseOptionalPositiveInt(raw.minNightlyPrice);
  const maxNightlyPrice = parseOptionalPositiveInt(raw.maxNightlyPrice);
  if (
    minNightlyPrice !== null &&
    maxNightlyPrice !== null &&
    minNightlyPrice > maxNightlyPrice
  ) {
    throw new BadRequestException('minNightlyPrice cannot exceed maxNightlyPrice');
  }

  const enabledProductCodes = normalizeEnabledProductCodes(
    raw.enabledProductCodes,
    {
      offerBreakfast:
        raw.offerBreakfast === undefined
          ? undefined
          : Boolean(raw.offerBreakfast),
      offerNonRefundable:
        raw.offerNonRefundable === undefined
          ? undefined
          : Boolean(raw.offerNonRefundable),
    },
  );

  return {
    version: 1,
    weekendDays: [...weekendDays],
    weekendMultiplier,
    minNightlyPrice,
    maxNightlyPrice,
    platformFeeAmount: Math.round(platformFeeAmount),
    breakfastUpliftPerNight,
    halfBoardUpliftPerNight,
    fullBoardUpliftPerNight,
    nonRefundableDiscountPercent: Math.round(nonRefundableDiscountPercent),
    enabledProductCodes,
  };
}

export function serializePricingConfig(config: PricingConfigV1): PricingConfigV1 {
  return parsePricingConfig(config);
}
