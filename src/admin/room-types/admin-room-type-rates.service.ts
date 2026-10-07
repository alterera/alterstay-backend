import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertDateRange, parseIsoDate } from '../admin.utils';
import { UpsertRoomTypeRatesDto } from '../dto/admin.dto';
import { AdminRoomTypesService } from './admin-room-types.service';

@Injectable()
export class AdminRoomTypeRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomTypes: AdminRoomTypesService,
  ) {}

  async listRates(
    propertyId: string,
    roomTypeId: string,
    from?: string,
    to?: string,
  ) {
    await this.roomTypes.assertRoomType(propertyId, roomTypeId);

    const where: { roomTypeId: string; date?: { gte?: Date; lt?: Date } } = {
      roomTypeId,
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

  async upsertRates(
    propertyId: string,
    roomTypeId: string,
    dto: UpsertRoomTypeRatesDto,
  ) {
    await this.roomTypes.assertRoomType(propertyId, roomTypeId);
    const nights = assertDateRange(dto.startDate, dto.endDate);
    const currency = dto.currency ?? 'INR';

    await this.prisma.$transaction(
      nights.map((date) =>
        this.prisma.roomTypeDailyRate.upsert({
          where: {
            roomTypeId_date: { roomTypeId, date },
          },
          update: {
            basePrice: dto.basePrice,
            currency,
          },
          create: {
            roomTypeId,
            date,
            basePrice: dto.basePrice,
            currency,
          },
        }),
      ),
    );

    return this.listRates(propertyId, roomTypeId, dto.startDate, dto.endDate);
  }

  async deleteRates(
    propertyId: string,
    roomTypeId: string,
    startDate: string,
    endDate: string,
  ) {
    await this.roomTypes.assertRoomType(propertyId, roomTypeId);
    const nights = assertDateRange(startDate, endDate);
    const rangeStart = parseIsoDate(startDate);
    const rangeEnd = parseIsoDate(endDate);

    const overlapping = await this.prisma.reservationItem.count({
      where: {
        roomTypeId,
        checkIn: { lt: rangeEnd },
        checkOut: { gt: rangeStart },
      },
    });
    if (overlapping > 0) {
      throw new ConflictException(
        'Cannot delete rates: bookings exist for this room type in the selected date range.',
      );
    }

    const result = await this.prisma.roomTypeDailyRate.deleteMany({
      where: {
        roomTypeId,
        date: { in: nights },
      },
    });

    return { deleted: result.count };
  }
}
