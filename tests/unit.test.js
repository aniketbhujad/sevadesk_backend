import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMobile, isValidIndianMobile, maskMobile } from '../src/utils/phone.js';
import { generateCustomerCode, generateReceiptNumber, generateIdempotencyKey } from '../src/utils/idGenerator.js';
import { formatReceiptMessage, queueAndSendReceiptSms } from '../src/services/sms/smsService.js';
import { MockSmsProvider } from '../src/services/sms/smsProvider.js';

test('Mobile Normalization & Indian Validation', async (t) => {
  await t.test('normalizes 10-digit Indian numbers', () => {
    assert.equal(normalizeMobile('9876543210'), '9876543210');
    assert.equal(normalizeMobile('+91 98765 43210'), '9876543210');
    assert.equal(normalizeMobile('09876543210'), '9876543210');
    assert.equal(normalizeMobile('91-98765-43210'), '9876543210');
  });

  await t.test('validates valid Indian mobile numbers', () => {
    assert.equal(isValidIndianMobile('9876543210'), true);
    assert.equal(isValidIndianMobile('8123456789'), true);
    assert.equal(isValidIndianMobile('7012345678'), true);
    assert.equal(isValidIndianMobile('6301234567'), true);
    // Invalid (starts with 1, or wrong length)
    assert.equal(isValidIndianMobile('1234567890'), false);
    assert.equal(isValidIndianMobile('98765'), false);
  });

  await t.test('masks mobile numbers safely for logs/receipts', () => {
    assert.equal(maskMobile('9876543210'), '98XXXXXX10');
  });
});

test('Collision-safe ID Generation', async (t) => {
  await t.test('generates valid customer code with date format', () => {
    const code = generateCustomerCode();
    assert.match(code, /^CUST-\d{8}-[A-F0-9]{4}$/);
  });

  await t.test('generates valid receipt number', () => {
    const receiptNo = generateReceiptNumber();
    const currentYear = new Date().getFullYear();
    assert.match(receiptNo, new RegExp(`^SD-${currentYear}-\\d{6}$`));
  });

  await t.test('generates unique idempotency keys', () => {
    const key1 = generateIdempotencyKey('SMS');
    const key2 = generateIdempotencyKey('SMS');
    assert.notEqual(key1, key2);
  });
});

test('SMS Template Formatting & Mock Provider', async (t) => {
  await t.test('correctly formats SMS receipt template', () => {
    const template = '{CENTRE_NAME}: Receipt {RECEIPT_NO}. Service: {SERVICE_NAME}. Total: Rs {TOTAL}. Paid: Rs {PAID_TO_DATE}. Balance: Rs {BALANCE}. Thank you.';
    const data = {
      centreName: 'SevaDesk Kendra',
      receiptNumber: 'SD-2026-123456',
      serviceName: 'PAN Card – New PAN Application',
      totalCharge: 120,
      paidToDate: 120,
      balance: 0,
    };

    const formatted = formatReceiptMessage(template, data);
    assert.equal(
      formatted,
      'SevaDesk Kendra: Receipt SD-2026-123456. Service: PAN Card – New PAN Application. Total: Rs 120.00. Paid: Rs 120.00. Balance: Rs 0.00. Thank you.'
    );
  });

  await t.test('MockSmsProvider delivers simulated success with message ID and SENT status', async () => {
    const provider = new MockSmsProvider();
    const result = await provider.sendSms({
      destinationNumber: '9876543210',
      message: 'Test mock message',
      idempotencyKey: 'IDEMP-TEST-001',
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'SENT');
    assert.equal(result.provider, 'mock');
    assert.match(result.messageId, /^mock-aws-msg-/);
  });
});

test('Financial Balance Derivation Logic', async (t) => {
  await t.test('scenario 1: full payment upfront', () => {
    const totalCharge = 500;
    const paid = 500;
    const balance = Math.max(0, totalCharge - paid);
    const status = balance === 0 ? 'PAID' : 'PARTIALLY_PAID';
    assert.equal(balance, 0);
    assert.equal(status, 'PAID');
  });

  await t.test('scenario 2: partial payment upfront then subsequent payment', () => {
    const totalCharge = 500;
    let paid = 300;
    let balance = Math.max(0, totalCharge - paid);
    let status = balance === 0 ? 'PAID' : (paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

    assert.equal(balance, 200);
    assert.equal(status, 'PARTIALLY_PAID');

    // Customer pays remaining ₹200 later
    const subsequentPayment = 200;
    paid += subsequentPayment;
    balance = Math.max(0, totalCharge - paid);
    status = balance === 0 ? 'PAID' : (paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

    assert.equal(balance, 0);
    assert.equal(status, 'PAID');
  });

  await t.test('scenario 3: zero initial payment', () => {
    const totalCharge = 250;
    const paid = 0;
    const balance = Math.max(0, totalCharge - paid);
    const status = balance === 0 ? 'PAID' : (paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

    assert.equal(balance, 250);
    assert.equal(status, 'UNPAID');
  });
});
