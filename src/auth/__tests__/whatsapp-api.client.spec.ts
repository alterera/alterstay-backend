import {
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppApiClient } from '../whatsapp-api.client';
import { WhatsAppApiConfig } from '../whatsapp-api.config';

type FetchMock = jest.MockedFunction<typeof fetch>;

function configStub(overrides: Partial<WhatsAppApiConfig> = {}): WhatsAppApiConfig {
  return {
    whatsappApiBaseUrl: 'https://api.example.test',
    whatsappApiKey: 'internal-api-key',
    requestTimeoutMs: 5000,
    otpTemplateName: 'otp_verification',
    otpTemplateLanguage: 'en_US',
    isWhatsAppConfigured: true,
    ...overrides,
  } as WhatsAppApiConfig;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WhatsAppApiClient', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports unavailable when WhatsApp is not configured', async () => {
    const client = new WhatsAppApiClient(
      configStub({ isWhatsAppConfigured: false }),
    );

    await expect(
      client.sendOtpTemplate({
        to: '919876543210',
        otp: '123456',
        idempotencyKey: 'alterstay-otp-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the otp_verification template with idempotency key', async () => {
    const client = new WhatsAppApiClient(configStub());
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: 'msg-1',
          status: 'sent',
          metaMessageId: 'wamid.abc',
        },
      }),
    );

    const result = await client.sendOtpTemplate({
      to: '919876543210',
      otp: '123456',
      idempotencyKey: 'alterstay-otp-42',
    });

    expect(result.data.status).toBe('sent');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/whatsapp/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'internal-api-key',
    );
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'alterstay-otp-42',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      to: '919876543210',
      type: 'template',
      templateName: 'otp_verification',
      language: 'en_US',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: '123456' }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: '123456' }],
        },
      ],
    });
  });

  it('maps transport failures to BadGatewayException', async () => {
    const client = new WhatsAppApiClient(configStub());
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      client.sendOtpTemplate({
        to: '919876543210',
        otp: '123456',
        idempotencyKey: 'alterstay-otp-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps 4xx responses to InternalServerErrorException', async () => {
    const client = new WhatsAppApiClient(configStub());
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        message: 'Invalid template',
        correlationId: 'corr-123',
      }),
    );

    await expect(
      client.sendOtpTemplate({
        to: '919876543210',
        otp: '123456',
        idempotencyKey: 'alterstay-otp-1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
