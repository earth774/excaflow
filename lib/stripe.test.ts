import { describe, it, expect, vi } from 'vitest';

// We need to mock Stripe constructor before importing
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      // Mock instance methods if needed
    }))
  };
});

describe('stripe', () => {
  it('should initialize stripe with secret key', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const { stripe } = await import('./stripe');
    expect(stripe).toBeDefined();
  });
});
