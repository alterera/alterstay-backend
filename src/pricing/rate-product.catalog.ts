/**
 * Fixed sell-product matrix per room type (OYO / FabHotels style).
 * BAR is stored once per room type per date; these products derive sell prices.
 */
export type RateProductCode =
  | 'EP_REFUNDABLE'
  | 'EP_NON_REFUNDABLE'
  | 'CP_REFUNDABLE'
  | 'CP_NON_REFUNDABLE'
  | 'HB_REFUNDABLE'
  | 'HB_NON_REFUNDABLE'
  | 'FB_REFUNDABLE'
  | 'FB_NON_REFUNDABLE';

export type MealPlanCode =
  | 'ROOM_ONLY'
  | 'BREAKFAST'
  | 'HALF_BOARD'
  | 'FULL_BOARD';

export type RateProductDefinition = {
  code: RateProductCode;
  name: string;
  guestLabel: string;
  mealPlanCode: MealPlanCode;
  refundable: boolean;
  sortOrder: number;
};

export const REQUIRED_PRODUCT_CODE: RateProductCode = 'EP_REFUNDABLE';

export const RATE_PRODUCT_CATALOG: RateProductDefinition[] = [
  {
    code: 'EP_REFUNDABLE',
    name: 'Room Only',
    guestLabel: 'Room only · Free cancellation',
    mealPlanCode: 'ROOM_ONLY',
    refundable: true,
    sortOrder: 1,
  },
  {
    code: 'EP_NON_REFUNDABLE',
    name: 'Room Only',
    guestLabel: 'Room only · Non-refundable',
    mealPlanCode: 'ROOM_ONLY',
    refundable: false,
    sortOrder: 2,
  },
  {
    code: 'CP_REFUNDABLE',
    name: 'Breakfast Included',
    guestLabel: 'Breakfast included · Free cancellation',
    mealPlanCode: 'BREAKFAST',
    refundable: true,
    sortOrder: 3,
  },
  {
    code: 'CP_NON_REFUNDABLE',
    name: 'Breakfast Included',
    guestLabel: 'Breakfast included · Non-refundable',
    mealPlanCode: 'BREAKFAST',
    refundable: false,
    sortOrder: 4,
  },
  {
    code: 'HB_REFUNDABLE',
    name: 'Breakfast + Dinner',
    guestLabel: 'Breakfast + Dinner · Free cancellation',
    mealPlanCode: 'HALF_BOARD',
    refundable: true,
    sortOrder: 5,
  },
  {
    code: 'HB_NON_REFUNDABLE',
    name: 'Breakfast + Dinner',
    guestLabel: 'Breakfast + Dinner · Non-refundable',
    mealPlanCode: 'HALF_BOARD',
    refundable: false,
    sortOrder: 6,
  },
  {
    code: 'FB_REFUNDABLE',
    name: 'All Meals Included',
    guestLabel: 'All meals · Free cancellation',
    mealPlanCode: 'FULL_BOARD',
    refundable: true,
    sortOrder: 7,
  },
  {
    code: 'FB_NON_REFUNDABLE',
    name: 'All Meals Included',
    guestLabel: 'All meals · Non-refundable',
    mealPlanCode: 'FULL_BOARD',
    refundable: false,
    sortOrder: 8,
  },
];

export const RATE_PRODUCT_CODES = RATE_PRODUCT_CATALOG.map((p) => p.code);

const DEFAULT_ENABLED_CODES: RateProductCode[] = [
  'EP_REFUNDABLE',
  'EP_NON_REFUNDABLE',
  'CP_REFUNDABLE',
  'CP_NON_REFUNDABLE',
];

export function getRateProduct(code: string): RateProductDefinition | null {
  return RATE_PRODUCT_CATALOG.find((p) => p.code === code) ?? null;
}

export function isRateProductCode(code: string): code is RateProductCode {
  return RATE_PRODUCT_CODES.includes(code as RateProductCode);
}

export function getProductGuestLabel(code: string): string | null {
  return getRateProduct(code)?.guestLabel ?? null;
}

/** @deprecated Migrated from legacy offerBreakfast / offerNonRefundable toggles. */
export function resolveEnabledProductCodesFromLegacyToggles(toggles: {
  offerBreakfast: boolean;
  offerNonRefundable: boolean;
}): RateProductCode[] {
  const codes: RateProductCode[] = [REQUIRED_PRODUCT_CODE];

  if (toggles.offerNonRefundable) {
    codes.push('EP_NON_REFUNDABLE');
  }
  if (toggles.offerBreakfast) {
    codes.push('CP_REFUNDABLE');
    if (toggles.offerNonRefundable) {
      codes.push('CP_NON_REFUNDABLE');
    }
  }

  return codes;
}

export function normalizeEnabledProductCodes(
  codes: unknown,
  legacy?: { offerBreakfast?: boolean; offerNonRefundable?: boolean },
): RateProductCode[] {
  if (Array.isArray(codes) && codes.length > 0) {
    const valid = codes.filter(
      (code): code is RateProductCode =>
        typeof code === 'string' && isRateProductCode(code),
    );
    if (!valid.includes(REQUIRED_PRODUCT_CODE)) {
      valid.unshift(REQUIRED_PRODUCT_CODE);
    }
    return [...new Set(valid)];
  }

  if (
    legacy?.offerBreakfast !== undefined ||
    legacy?.offerNonRefundable !== undefined
  ) {
    return resolveEnabledProductCodesFromLegacyToggles({
      offerBreakfast: legacy.offerBreakfast ?? true,
      offerNonRefundable: legacy.offerNonRefundable ?? true,
    });
  }

  return [...DEFAULT_ENABLED_CODES];
}
