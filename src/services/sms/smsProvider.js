import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { config } from '../../config/env.js';
import { maskMobile } from '../../utils/phone.js';

/**
 * Base SMS Provider Interface
 */
class BaseSmsProvider {
  async sendSms({ destinationNumber, message, idempotencyKey }) {
    throw new Error('sendSms method must be implemented by subclass');
  }
}

/**
 * Mock SMS Provider for local development, testing, and zero-cost simulation
 */
export class MockSmsProvider extends BaseSmsProvider {
  async sendSms({ destinationNumber, message, idempotencyKey }) {
    const masked = maskMobile(destinationNumber);
    const mockMessageId = `mock-aws-msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[MOCK SMS] Simulated AWS End User Messaging SMS send:`);
    console.log(`  To: ${masked}`);
    console.log(`  IdempotencyKey: ${idempotencyKey}`);
    console.log(`  MessageId: ${mockMessageId}`);
    console.log(`  Note: SMS_ENABLED=false (Mock mode active. No charges incurred).`);

    // Simulate async network latency
    await new Promise((res) => setTimeout(res, 300));

    return {
      success: true,
      messageId: mockMessageId,
      status: 'SENT', // Provider accepted message; delivered requires webhook/event
      provider: 'mock',
    };
  }
}

/**
 * AWS End User Messaging SMS Provider using @aws-sdk/client-pinpoint-sms-voice-v2
 */
export class AwsSmsProvider extends BaseSmsProvider {
  constructor() {
    super();
    const clientConfig = {
      region: config.sms.region,
    };

    // If explicit AWS credentials are provided in env, use them;
    // Otherwise fallback to AWS SDK default credential chain (IAM Role / ~/.aws/credentials)
    if (config.sms.accessKeyId && config.sms.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.sms.accessKeyId,
        secretAccessKey: config.sms.secretAccessKey,
      };
    }

    this.client = new PinpointSMSVoiceV2Client(clientConfig);
  }

  async sendSms({ destinationNumber, message, idempotencyKey }) {
    // Format to E.164: Indian numbers prepend +91 if needed
    let formattedNumber = destinationNumber.trim();
    if (!formattedNumber.startsWith('+')) {
      if (formattedNumber.length === 10) {
        formattedNumber = `+91${formattedNumber}`;
      } else {
        formattedNumber = `+${formattedNumber}`;
      }
    }

    const params = {
      DestinationPhoneNumber: formattedNumber,
      MessageBody: message,
      MessageType: 'TRANSACTIONAL',
    };

    if (config.sms.originationIdentity) {
      params.OriginationIdentity = config.sms.originationIdentity;
    }

    if (config.sms.configurationSet) {
      params.ConfigurationSetName = config.sms.configurationSet;
    }

    try {
      const command = new SendTextMessageCommand(params);
      const response = await this.client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
        status: 'SENT',
        provider: 'aws-end-user-messaging-sms',
      };
    } catch (err) {
      console.error(`[AWS SMS Error] Failed to send SMS to ${maskMobile(destinationNumber)}:`, err.message);
      return {
        success: false,
        errorCode: err.name || 'AWS_SMS_ERROR',
        errorMessage: err.message,
        status: 'FAILED',
        provider: 'aws-end-user-messaging-sms',
      };
    }
  }
}

/**
 * Factory to retrieve the active SMS provider
 */
let providerInstance = null;

export function getSmsProvider() {
  if (providerInstance) return providerInstance;

  if (config.sms.enabled) {
    console.log('📡 Initializing AWS End User Messaging SMS Provider');
    providerInstance = new AwsSmsProvider();
  } else {
    console.log('🧪 Using Mock SMS Provider (SMS_ENABLED is false)');
    providerInstance = new MockSmsProvider();
  }

  return providerInstance;
}
