import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamicPricingEngine } from './dynamic-pricing.engine';
import {
  DEFAULT_PRICING_CONFIG,
  parsePricingConfig,
  type PricingConfigV1,
} from './pricing-config.schema';
import { RateProductEngine } from './rate-product.engine';
import {
  getRateProduct,
  isRateProductCode,
  type RateProductCode,
} from './rate-product.catalog';
import {
  ComputeQuoteOptions,
  MembershipPricingContext,
  PricingClient,
  Quote,
  RatePriceLike,
  ResolvedNightlyRate,
} from './pricing.types';

/**
 * Single source of truth for money. Both the browse path (SearchService) and the
 * booking path (BookingsService) must price through this service so the number a
 * guest sees while browsing and the number they are charged cannot drift.
 */
export const TAX_RATE = 0.18;
export const DEFAULT_CURRENCY = 'INR';

@Injectable()
export class PricingService {
  readonly taxRate = TAX_RATE;
  private readonly dynamicPricing = new DynamicPricingEngine();
  private readonly rateProduct = new RateProductEngine();

  constructor(private readonly config: ConfigService) {}

  estimateGst(amount: number): number {
    return Math.round(amount * TAX_RATE);
  }

  /** @deprecated Use estimateGst — kept for callers during migration. */
  estimateTaxes(amount: number): number {
    return this.estimateGst(amount);
  }

  /**
   * Orders `prices` to match `nights` exactly.
   *
   * @returns the ordered rows, or `null` when any night has no price. Search
   * relies on the `null` branch to silently skip unbookable rate plans.
   */
  matchNights<T extends RatePriceLike>(
    prices: T[],
    nights: Date[],
  ): T[] | null {
    if (!nights.length) return null;

    const byTime = new Map(prices.map((p) => [p.date.getTime(), p]));
    const ordered: T[] = [];
    for (const night of nights) {
      const price = byTime.get(night.getTime());
      if (!price) return null;
      ordered.push(price);
    }
    return ordered;
  }

  resolveNightlyRates(
    prices: RatePriceLike[],
    pricingConfig?: PricingConfigV1 | unknown,
  ): ResolvedNightlyRate[] {
    const config = parsePricingConfig(pricingConfig ?? null);
    return this.dynamicPricing.resolveStay(prices, config);
  }

  applyProductModifiers(
    resolvedNightly: ResolvedNightlyRate[],
    productCode: RateProductCode,
    pricingConfig?: PricingConfigV1 | unknown,
  ): ResolvedNightlyRate[] {
    const config = parsePricingConfig(pricingConfig ?? null);
    return this.rateProduct.applyProduct(resolvedNightly, productCode, config);
  }

  /**
   * Full nightly resolution: dynamic BAR adjustments + product modifiers.
   */
  resolveProductNights(
    prices: RatePriceLike[],
    productCode: RateProductCode,
    pricingConfig?: PricingConfigV1 | unknown,
  ): ResolvedNightlyRate[] {
    const dynamic = this.resolveNightlyRates(prices, pricingConfig);
    return this.applyProductModifiers(dynamic, productCode, pricingConfig);
  }

  /**
   * Pure quote math over resolved nightly rates. GST applies to room subtotal
   * only; platform fee is a flat per-booking charge (not taxed).
   */
  computeQuote(
    resolvedNightly: ResolvedNightlyRate[],
    rooms: number,
    options: ComputeQuoteOptions = {},
  ): Quote {
    if (!resolvedNightly.length) {
      throw new BadRequestException('Cannot price a stay with no nights');
    }
    if (!Number.isInteger(rooms) || rooms < 1) {
      throw new BadRequestException('rooms must be a positive integer');
    }

    const perRoom = resolvedNightly.reduce(
      (sum, night) => sum + night.finalPrice,
      0,
    );
    const subtotal = perRoom * rooms;
    const platformFee = Math.round(
      options.platformFeeAmount ?? DEFAULT_PRICING_CONFIG.platformFeeAmount,
    );
    const gstAmount = this.estimateGst(subtotal);
    const taxAmount = gstAmount + platformFee;
    const totalAmount = subtotal + taxAmount;

    let coinEarnPreview: Quote['coinEarnPreview'];
    const membership = options.membership;
    if (membership && membership.discountPercent > 0) {
      coinEarnPreview = {
        planCode: membership.planCode,
        earnPercent: membership.discountPercent,
        earnableAmount: Math.round(
          (subtotal * membership.discountPercent) / 100,
        ),
      };
    }

    return {
      nightly: resolvedNightly,
      nights: resolvedNightly.length,
      rooms,
      subtotal,
      gstAmount,
      platformFee,
      taxAmount,
      discountAmount: 0,
      totalAmount,
      currency: DEFAULT_CURRENCY,
      taxRate: TAX_RATE,
      coinEarnPreview,
    };
  }

  /**
   * Prices a sell product for browse/search when room-type BAR rows and property
   * config are already loaded.
   */
  quoteFromRoomTypeRates(
    dailyRates: RatePriceLike[],
    nights: Date[],
    rooms: number,
    productCode: RateProductCode,
    pricingConfig?: PricingConfigV1 | unknown,
    membership?: MembershipPricingContext,
  ): Quote | null {
    const ordered = this.matchNights(dailyRates, nights);
    if (!ordered) return null;

    try {
      this.assertStayAllowed(ordered);
    } catch {
      return null;
    }

    const config = parsePricingConfig(pricingConfig ?? null);
    const resolved = this.resolveProductNights(ordered, productCode, config);
    return this.computeQuote(resolved, rooms, {
      platformFeeAmount: config.platformFeeAmount,
      membership,
    });
  }

  /**
   * @deprecated Use quoteFromRoomTypeRates — kept for transitional callers.
   */
  quoteFromRatePrices(
    prices: RatePriceLike[],
    nights: Date[],
    rooms: number,
    pricingConfig?: PricingConfigV1 | unknown,
    membership?: MembershipPricingContext,
    productCode: RateProductCode = 'EP_REFUNDABLE',
  ): Quote | null {
    return this.quoteFromRoomTypeRates(
      prices,
      nights,
      rooms,
      productCode,
      pricingConfig,
      membership,
    );
  }

  /**
   * Applies coin redemption to a quote. Coins reduce room subtotal first; GST is
   * recalculated on the remaining subtotal. Platform fee stays flat per booking.
   */
  applyCoinRedemption(quote: Quote, coinsToRedeem: number): Quote {
    if (coinsToRedeem < 0) {
      throw new BadRequestException('coinsToRedeem cannot be negative');
    }
    if (coinsToRedeem === 0) {
      return { ...quote, coinsRedeemed: 0 };
    }

    const maxApplicable = quote.subtotal;
    if (coinsToRedeem > maxApplicable) {
      throw new BadRequestException(
        `Cannot redeem more than ${maxApplicable} coins against this booking`,
      );
    }

    const subtotalAfter = quote.subtotal - coinsToRedeem;
    const gstAmount = this.estimateGst(subtotalAfter);
    const taxAmount = gstAmount + quote.platformFee;
    const totalAmount = subtotalAfter + taxAmount;

    return {
      ...quote,
      subtotal: subtotalAfter,
      gstAmount,
      taxAmount,
      totalAmount,
      coinsRedeemed: coinsToRedeem,
    };
  }

  /**
   * Enforces the stay-length and arrival/departure restrictions carried on
   * room-type daily rates.
   */
  assertStayAllowed(prices: RatePriceLike[]): void {
    if (!prices.length) return;

    const nights = prices.length;
    const arrival = prices[0];
    const lastNight = prices[prices.length - 1];

    if (arrival.minStay != null && nights < arrival.minStay) {
      throw new BadRequestException(
        `This rate requires a minimum stay of ${arrival.minStay} night(s)`,
      );
    }
    if (arrival.maxStay != null && nights > arrival.maxStay) {
      throw new BadRequestException(
        `This rate allows a maximum stay of ${arrival.maxStay} night(s)`,
      );
    }
    if (arrival.closedToArrival) {
      throw new BadRequestException(
        'This rate is closed to arrival on the selected check-in date',
      );
    }
    if (lastNight.closedToDeparture) {
      throw new BadRequestException(
        'This rate is closed to departure on the selected check-out date',
      );
    }
  }

  /**
   * Authoritative quote for the booking path. Must be called with the
   * transaction client so the prices read are the ones the reservation is
   * written from.
   */
  async loadAndQuote(
    client: PricingClient,
    ratePlanId: string,
    nights: Date[],
    rooms: number,
    options: {
      propertyId?: string;
      membership?: MembershipPricingContext;
    } = {},
  ): Promise<Quote> {
    const ratePlan = await client.ratePlan.findUnique({
      where: { id: ratePlanId },
      select: {
        roomTypeId: true,
        productCode: true,
        property: { select: { pricingConfigJson: true } },
      },
    });

    if (!ratePlan) {
      throw new BadRequestException('Rate plan not found');
    }

    const productCode = ratePlan.productCode;
    if (!productCode || !isRateProductCode(productCode)) {
      throw new BadRequestException(
        'This rate plan is not linked to a sell product. Sync rate plans for the room type.',
      );
    }

    const dailyRates = await client.roomTypeDailyRate.findMany({
      where: { roomTypeId: ratePlan.roomTypeId, date: { in: nights } },
      orderBy: { date: 'asc' },
    });

    const ordered = this.matchNights(dailyRates, nights);
    if (!ordered) {
      throw new BadRequestException(
        'This room type is not priced for every night of the selected stay',
      );
    }

    this.assertStayAllowed(ordered);

    const config = parsePricingConfig(ratePlan.property.pricingConfigJson);
    const resolved = this.resolveProductNights(ordered, productCode, config);
    return this.computeQuote(resolved, rooms, {
      platformFeeAmount: config.platformFeeAmount,
      membership: options.membership,
    });
  }

  /** Display metadata for a sell product. */
  productMeta(productCode: string) {
    return getRateProduct(productCode);
  }
}
