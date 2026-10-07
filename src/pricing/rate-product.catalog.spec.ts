import {
  normalizeEnabledProductCodes,
  resolveEnabledProductCodesFromLegacyToggles,
} from './rate-product.catalog';

describe('resolveEnabledProductCodesFromLegacyToggles', () => {
  it('returns only EP_REFUNDABLE when both toggles are off', () => {
    expect(
      resolveEnabledProductCodesFromLegacyToggles({
        offerBreakfast: false,
        offerNonRefundable: false,
      }),
    ).toEqual(['EP_REFUNDABLE']);
  });

  it('adds breakfast refundable when breakfast is on', () => {
    expect(
      resolveEnabledProductCodesFromLegacyToggles({
        offerBreakfast: true,
        offerNonRefundable: false,
      }),
    ).toEqual(['EP_REFUNDABLE', 'CP_REFUNDABLE']);
  });

  it('adds room-only non-refundable when NR is on without breakfast', () => {
    expect(
      resolveEnabledProductCodesFromLegacyToggles({
        offerBreakfast: false,
        offerNonRefundable: true,
      }),
    ).toEqual(['EP_REFUNDABLE', 'EP_NON_REFUNDABLE']);
  });

  it('returns all four products when both toggles are on', () => {
    expect(
      resolveEnabledProductCodesFromLegacyToggles({
        offerBreakfast: true,
        offerNonRefundable: true,
      }),
    ).toEqual([
      'EP_REFUNDABLE',
      'EP_NON_REFUNDABLE',
      'CP_REFUNDABLE',
      'CP_NON_REFUNDABLE',
    ]);
  });
});

describe('normalizeEnabledProductCodes', () => {
  it('always includes EP_REFUNDABLE', () => {
    expect(normalizeEnabledProductCodes(['CP_REFUNDABLE'])).toEqual([
      'EP_REFUNDABLE',
      'CP_REFUNDABLE',
    ]);
  });

  it('deduplicates and preserves valid codes', () => {
    expect(
      normalizeEnabledProductCodes([
        'EP_REFUNDABLE',
        'HB_REFUNDABLE',
        'HB_REFUNDABLE',
        'FB_NON_REFUNDABLE',
      ]),
    ).toEqual(['EP_REFUNDABLE', 'HB_REFUNDABLE', 'FB_NON_REFUNDABLE']);
  });

  it('falls back to legacy toggles when codes are missing', () => {
    expect(
      normalizeEnabledProductCodes(undefined, {
        offerBreakfast: false,
        offerNonRefundable: true,
      }),
    ).toEqual(['EP_REFUNDABLE', 'EP_NON_REFUNDABLE']);
  });
});
