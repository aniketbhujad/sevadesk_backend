import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { dispatchRequest } from './testHelper.js';

test('API In-Process Route Tests (Sandbox Compatible)', async (t) => {
  await t.test('GET /api/health responds with safe status information', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/health' });
    assert.equal(res.status, 200);
    assert.equal(res.body.app, 'SevaDesk CRM');
    assert.ok(res.body.timestamp);
    assert.ok(res.body.sms);
    assert.equal(res.body.sms.mode, 'mock');
  });

  await t.test('Unauthenticated request to protected endpoint /api/customers returns 401', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/customers' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Authentication required/i);
  });

  await t.test('Unauthenticated request to /api/service-records returns 401', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/service-records' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('Unauthenticated request to /api/dashboard/summary returns 401', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/dashboard/summary' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('POST /api/auth/login validates missing credentials', async () => {
    const res = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/auth/login',
      body: {},
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Validation error/i);
  });

  await t.test('404 on non-existent endpoint', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/does-not-exist' });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });
});
