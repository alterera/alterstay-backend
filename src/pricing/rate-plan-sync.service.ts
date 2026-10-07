import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parsePricingConfig } from './pricing-config.schema';
import {
  RATE_PRODUCT_CATALOG,
  type RateProductCode,
} from './rate-product.catalog';

const REFUNDABLE_POLICY_NAME = 'Flexible';
const NON_REFUNDABLE_POLICY_NAME = 'Non-refundable';

@Injectable()
export class RatePlanSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures sell products for a room type match the property's enabled list.
   * Creates missing plans, activates enabled ones, deactivates disabled ones.
   */
  async syncForRoomType(propertyId: string, roomTypeId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { pricingConfigJson: true },
    });
    const config = parsePricingConfig(property?.pricingConfigJson ?? null);
    const enabledCodes = new Set(config.enabledProductCodes);

    const [mealPlans, policies] = await Promise.all([
      this.prisma.mealPlan.findMany(),
      this.prisma.cancellationPolicy.findMany(),
    ]);

    const mealByCode = new Map(mealPlans.map((m) => [m.code, m.id]));
    const refundablePolicyId =
      policies.find((p) => p.name === REFUNDABLE_POLICY_NAME)?.id ?? null;
    const nonRefundablePolicyId =
      policies.find((p) => p.name === NON_REFUNDABLE_POLICY_NAME)?.id ?? null;

    const existing = await this.prisma.ratePlan.findMany({
      where: { roomTypeId },
      select: { id: true, productCode: true },
    });
    const byCode = new Map(
      existing
        .filter((p) => p.productCode)
        .map((p) => [p.productCode as RateProductCode, p.id]),
    );

    for (const product of RATE_PRODUCT_CATALOG) {
      const isEnabled = enabledCodes.has(product.code);
      const mealPlanId = mealByCode.get(product.mealPlanCode) ?? null;
      const cancellationPolicyId = product.refundable
        ? refundablePolicyId
        : nonRefundablePolicyId;

      const existingId = byCode.get(product.code);
      if (existingId) {
        await this.prisma.ratePlan.update({
          where: { id: existingId },
          data: {
            name: product.name,
            description: null,
            mealPlanId,
            cancellationPolicyId,
            status: isEnabled ? 'ACTIVE' : 'INACTIVE',
            productCode: product.code,
          },
        });
        continue;
      }

      if (!isEnabled) continue;

      await this.prisma.ratePlan.create({
        data: {
          propertyId,
          roomTypeId,
          name: product.name,
          description: null,
          mealPlanId,
          cancellationPolicyId,
          productCode: product.code,
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.ratePlan.updateMany({
      where: { roomTypeId, productCode: null },
      data: { status: 'INACTIVE' },
    });

    return this.prisma.ratePlan.findMany({
      where: { roomTypeId, status: 'ACTIVE' },
      include: { mealPlan: true, cancellationPolicy: true },
      orderBy: { productCode: 'asc' },
    });
  }

  async syncForProperty(propertyId: string) {
    const roomTypes = await this.prisma.roomType.findMany({
      where: { propertyId, status: 'ACTIVE' },
      select: { id: true },
    });

    for (const roomType of roomTypes) {
      await this.syncForRoomType(propertyId, roomType.id);
    }
  }
}
