import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { RatePlanSyncService } from './rate-plan-sync.service';

@Module({
  providers: [PricingService, RatePlanSyncService],
  exports: [PricingService, RatePlanSyncService],
})
export class PricingModule {}
