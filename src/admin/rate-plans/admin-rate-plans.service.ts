import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertDateRange, parseIsoDate } from '../admin.utils';
import {
  CreateRatePlanDto,
  UpdateRatePlanDto,
  UpsertRatePricesDto,
} from '../dto/admin.dto';
import { AdminRoomTypesService } from '../room-types/admin-room-types.service';

const RATE_PLAN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

@Injectable()
export class AdminRatePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomTypes: AdminRoomTypesService,
  ) {}

  async listForProperty(propertyId: string) {
    return this.prisma.ratePlan.findMany({
      where: { propertyId },
      include: {
        roomType: true,
        mealPlan: true,
        cancellationPolicy: true,
        _count: { select: { reservationItems: true } },
      },
      orderBy: [{ roomType: { name: 'asc' } }, { productCode: 'asc' }],
    });
  }

  async getById(propertyId: string, ratePlanId: string) {
    const plan = await this.prisma.ratePlan.findFirst({
      where: { id: ratePlanId, propertyId },
      include: {
        roomType: true,
        mealPlan: true,
        cancellationPolicy: true,
        _count: { select: { reservationItems: true } },
      },
    });
    if (!plan) throw new NotFoundException('Rate plan not found');
    return plan;
  }

  /** @deprecated Rate plans are auto-generated from the product catalog. */
  async create(propertyId: string, dto: CreateRatePlanDto) {
    throw new BadRequestException(
      'Rate plans are auto-generated per room type. Create a room type or run sync-rate-plans instead.',
    );
  }

  async update(
    propertyId: string,
    ratePlanId: string,
    dto: UpdateRatePlanDto,
  ) {
    await this.getById(propertyId, ratePlanId);
    if (
      dto.status !== undefined &&
      !RATE_PLAN_STATUSES.includes(dto.status as typeof RATE_PLAN_STATUSES[number])
    ) {
      throw new BadRequestException(
        `status must be one of: ${RATE_PLAN_STATUSES.join(', ')}`,
      );
    }

    const data: UpdateRatePlanDto = { ...dto };
    if (data.name !== undefined) {
      data.name = data.name.trim();
    }

    return this.prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: {
        status: data.status,
        description: data.description,
      },
      include: {
        roomType: true,
        mealPlan: true,
        cancellationPolicy: true,
      },
    });
  }

  async remove(propertyId: string, ratePlanId: string) {
    throw new BadRequestException(
      'Rate plans cannot be deleted individually. Set status to INACTIVE or remove the room type.',
    );
  }

  /** Reads room-type BAR (single source of truth). */
  async listPrices(
    propertyId: string,
    ratePlanId: string,
    from?: string,
    to?: string,
  ) {
    const plan = await this.getById(propertyId, ratePlanId);

    const where: { roomTypeId: string; date?: { gte?: Date; lt?: Date } } = {
      roomTypeId: plan.roomTypeId,
    };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = parseIsoDate(from);
      if (to) where.date.lt = parseIsoDate(to);
    }

    return this.prisma.roomTypeDailyRate.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  /** Writes room-type BAR — applies to all sell products on this room type. */
  async upsertPrices(
    propertyId: string,
    ratePlanId: string,
    dto: UpsertRatePricesDto,
  ) {
    const plan = await this.getById(propertyId, ratePlanId);
    const nights = assertDateRange(dto.startDate, dto.endDate);
    const currency = dto.currency ?? 'INR';

    await this.prisma.$transaction(
      nights.map((date) =>
        this.prisma.roomTypeDailyRate.upsert({
          where: {
            roomTypeId_date: { roomTypeId: plan.roomTypeId, date },
          },
          update: {
            basePrice: dto.basePrice,
            currency,
          },
          create: {
            roomTypeId: plan.roomTypeId,
            date,
            basePrice: dto.basePrice,
            currency,
          },
        }),
      ),
    );

    return this.listPrices(propertyId, ratePlanId, dto.startDate, dto.endDate);
  }

  async deletePrices(
    propertyId: string,
    ratePlanId: string,
    startDate: string,
    endDate: string,
  ) {
    const plan = await this.getById(propertyId, ratePlanId);
    const nights = assertDateRange(startDate, endDate);
    const rangeStart = parseIsoDate(startDate);
    const rangeEnd = parseIsoDate(endDate);

    const overlapping = await this.prisma.reservationItem.count({
      where: {
        roomTypeId: plan.roomTypeId,
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
      },
    });
    if (overlapping > 0) {
      throw new ConflictException(
        'Cannot delete prices: bookings exist for this room type in the selected date range.',
      );
    }

    const result = await this.prisma.roomTypeDailyRate.deleteMany({
      where: {
        roomTypeId: plan.roomTypeId,
        date: { in: nights },
      },
    });

    return { deleted: result.count };
  }
}
