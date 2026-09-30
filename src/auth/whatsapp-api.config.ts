import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = 'https://api.alterera.net';
const DEFAULT_TEMPLATE_NAME = 'otp_verification';
const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';

@Injectable()
export class WhatsAppApiConfig {
  private readonly logger = new Logger(WhatsAppApiConfig.name);

  constructor(private readonly config: ConfigService) {}

  get whatsappApiBaseUrl(): string {
    return (
      this.config.get<string>('WHATSAPP_API_BASE_URL')?.replace(/\/+$/, '') ??
      DEFAULT_BASE_URL
    );
  }

  get whatsappApiKey(): string {
    return this.config.get<string>('WHATSAPP_API_KEY') ?? '';
  }

  get requestTimeoutMs(): number {
    return this.positiveInt('WHATSAPP_API_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  get otpTemplateName(): string {
    return (
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME') ??
      DEFAULT_TEMPLATE_NAME
    );
  }

  get otpTemplateLanguage(): string {
    return (
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANGUAGE') ??
      DEFAULT_TEMPLATE_LANGUAGE
    );
  }

  get isWhatsAppConfigured(): boolean {
    return Boolean(this.whatsappApiBaseUrl && this.whatsappApiKey);
  }

  private positiveInt(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(
        `${key}="${raw}" is not a positive number; using ${fallback}`,
      );
      return fallback;
    }
    return Math.floor(parsed);
  }
}
