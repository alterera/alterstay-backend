import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CreateRoomTypeDto,
  UpdateRoomTypeDto,
  UpsertRoomTypeRatesDto,
} from '../dto/admin.dto';
import { AdminPropertiesService } from '../properties/admin-properties.service';
import { AdminRoomTypeRatesService } from './admin-room-type-rates.service';
import { AdminRoomTypesService } from './admin-room-types.service';

@Controller('admin/properties/:propertyId/room-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class AdminRoomTypesController {
  constructor(
    private readonly roomTypes: AdminRoomTypesService,
    private readonly roomTypeRates: AdminRoomTypeRatesService,
    private readonly properties: AdminPropertiesService,
  ) {}

  @Get()
  async list(@Param('propertyId') propertyId: string) {
    await this.properties.getById(propertyId);
    return this.roomTypes.listForProperty(propertyId);
  }

  @Post()
  async create(
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateRoomTypeDto,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypes.create(propertyId, dto);
  }

  @Patch(':roomTypeId')
  async update(
    @Param('propertyId') propertyId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypes.update(propertyId, roomTypeId, dto);
  }

  @Delete(':roomTypeId')
  async remove(
    @Param('propertyId') propertyId: string,
    @Param('roomTypeId') roomTypeId: string,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypes.remove(propertyId, roomTypeId);
  }

  @Get(':roomTypeId/rates')
  async listRates(
    @Param('propertyId') propertyId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypeRates.listRates(propertyId, roomTypeId, from, to);
  }

  @Post(':roomTypeId/rates')
  async upsertRates(
    @Param('propertyId') propertyId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: UpsertRoomTypeRatesDto,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypeRates.upsertRates(propertyId, roomTypeId, dto);
  }

  @Delete(':roomTypeId/rates')
  async deleteRates(
    @Param('propertyId') propertyId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    await this.properties.getById(propertyId);
    return this.roomTypeRates.deleteRates(propertyId, roomTypeId, from, to);
  }
}
