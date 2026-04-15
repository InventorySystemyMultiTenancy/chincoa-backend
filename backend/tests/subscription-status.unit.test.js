import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { mapSubscriptionStatusForFrontend } from '../src/services/paymentService.js';

describe('subscription status normalization', () => {
  test('maps provider aliases to frontend contract', () => {
    assert.equal(mapSubscriptionStatusForFrontend('active'), 'authorized');
    assert.equal(mapSubscriptionStatusForFrontend('authorized'), 'authorized');
    assert.equal(mapSubscriptionStatusForFrontend('pending'), 'pending');
    assert.equal(mapSubscriptionStatusForFrontend('paused'), 'paused');
    assert.equal(mapSubscriptionStatusForFrontend('cancelled'), 'canceled');
    assert.equal(mapSubscriptionStatusForFrontend('canceled'), 'canceled');
  });

  test('falls back to unknown for unexpected status', () => {
    assert.equal(mapSubscriptionStatusForFrontend('mystery'), 'unknown');
    assert.equal(mapSubscriptionStatusForFrontend(null), 'unknown');
  });
});
