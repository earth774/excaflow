import { describe, it, expect, vi } from 'vitest';

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
}));

describe('prisma', () => {
  it('should export a prisma instance', async () => {
    const { prisma } = await import('./prisma');
    expect(prisma).toBeDefined();
  });
});
