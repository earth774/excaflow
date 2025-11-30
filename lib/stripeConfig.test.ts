import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('stripeConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default price ID if env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
    const { STRIPE_PRICE_ID } = await import('./stripeConfig');
    expect(STRIPE_PRICE_ID).toBe('price_1SW5QdAbVL76kMms9YZzqK03');
  });

  it('should use env var price ID if present', async () => {
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_test_123';
    const { STRIPE_PRICE_ID } = await import('./stripeConfig');
    expect(STRIPE_PRICE_ID).toBe('price_test_123');
  });
});
