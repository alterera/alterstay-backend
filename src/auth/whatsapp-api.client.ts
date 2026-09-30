import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppApiConfig } from './whatsapp-api.config';

export type SendOtpTemplateInput = {
  to: string;
  otp: string;
  idempotencyKey: string;
};

export type SendMessageResponse = {
  data: {
    id: string;
    status: string;
    metaMessageId?: string | null;
  };
};

/**
 * Sends WhatsApp template messages through api.alterera.net.
 */
@Injectable()
export class WhatsAppApiClient {
  private readonly logger = new Logger(WhatsAppApiClient.name);

  constructor(private readonly config: WhatsAppApiConfig) {}

  async sendOtpTemplate(input: SendOtpTemplateInput): Promise<SendMessageResponse> {
    if (!this.config.isWhatsAppConfigured) {
      throw new ServiceUnavailableException(
        'WhatsApp OTP is not configured on this environment',
      );
    }

    const body = {
      to: input.to,
      type: 'template',
      templateName: this.config.otpTemplateName,
      language: this.config.otpTemplateLanguage,
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: input.otp }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: input.otp }],
        },
      ],
    };

    return this.request<SendMessageResponse>(
      'POST',
      '/api/v1/whatsapp/messages',
      body,
      input.idempotencyKey,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<T> {
    const url = `${this.config.whatsappApiBaseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.config.whatsappApiKey,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`${method} ${path} failed in transport: ${reason}`);
      throw new BadGatewayException('Could not send OTP. Please try again shortly.');
    }

    const payload = await this.readJson(response);

    if (!response.ok) {
      const message = this.errorMessage(payload);
      const correlationId = this.correlationId(payload);
      this.logger.error(
        `${method} ${path} rejected with ${response.status}: ${message}${
          correlationId ? ` (correlationId=${correlationId})` : ''
        }`,
      );
      throw new InternalServerErrorException(
        'Could not send OTP. Please try again shortly.',
      );
    }

    return payload as T;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text.slice(0, 500) };
    }
  }

  private errorMessage(payload: unknown): string {
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = payload.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
    return 'The WhatsApp API rejected the request';
  }

  private correlationId(payload: unknown): string | undefined {
    if (
      payload &&
      typeof payload === 'object' &&
      'correlationId' in payload &&
      typeof payload.correlationId === 'string'
    ) {
      return payload.correlationId;
    }
    return undefined;
  }
}
