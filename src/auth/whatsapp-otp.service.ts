import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { toGatewayPhoneNumber } from './auth.utils';
import { WhatsAppApiClient } from './whatsapp-api.client';
import { WhatsAppApiConfig } from './whatsapp-api.config';

@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(
    private readonly whatsAppApiClient: WhatsAppApiClient,
    private readonly config: WhatsAppApiConfig,
  ) {}

  async sendOtp(
    e164Phone: string,
    otp: string,
    idempotencyKey: string,
  ): Promise<void> {
    if (!this.config.isWhatsAppConfigured) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'WhatsApp OTP is not configured on this environment',
        );
      }

      this.logger.warn(
        `WhatsApp OTP not configured; skipping delivery to ${e164Phone}`,
      );
      return;
    }

    const gatewayNumber = toGatewayPhoneNumber(e164Phone);

    await this.whatsAppApiClient.sendOtpTemplate({
      to: gatewayNumber,
      otp,
      idempotencyKey,
    });

    this.logger.log(
      `WhatsApp OTP sent for ${e164Phone} (gateway number: ${gatewayNumber})`,
    );
  }
}
