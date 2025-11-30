import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserIdFromRequest, getCurrentUserFromRequest } from './supabaseServer';

// Mock createClient
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

describe('supabaseServer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_SUPABASE_URL: 'url', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getUserIdFromRequest', () => {
    it('should return null if no authorization header', async () => {
      mockHeaders.mockResolvedValue({ get: () => null });
      const userId = await getUserIdFromRequest();
      expect(userId).toBeNull();
    });

    it('should return null if invalid token format', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'InvalidToken' });
      const userId = await getUserIdFromRequest();
      expect(userId).toBeNull();
    });

    it('should return userId if valid token', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'Bearer valid-token' });
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });

      const userId = await getUserIdFromRequest();
      expect(userId).toBe('user-123');
    });

    it('should return null if getUser fails', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'Bearer valid-token' });
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Error' } });

      const userId = await getUserIdFromRequest();
      expect(userId).toBeNull();
    });
    
    it('should return null and log error if unexpected error occurs', async () => {
        mockHeaders.mockRejectedValue(new Error('Unexpected'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const userId = await getUserIdFromRequest();
        expect(userId).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Error getting user ID from request:', expect.any(Error));
    });
  });

  describe('getCurrentUserFromRequest', () => {
    it('should return null if no authorization header', async () => {
      mockHeaders.mockResolvedValue({ get: () => null });
      const user = await getCurrentUserFromRequest();
      expect(user).toBeNull();
    });

    it('should return null if invalid token format', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'InvalidToken' });
      const user = await getCurrentUserFromRequest();
      expect(user).toBeNull();
    });

    it('should return user object if valid token', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'Bearer valid-token' });
      const mockUser = { id: 'user-123', email: 'test@test.com' };
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const user = await getCurrentUserFromRequest();
      expect(user).toEqual(mockUser);
    });

     it('should return null if error occurs (user null)', async () => {
      mockHeaders.mockResolvedValue({ get: () => 'Bearer valid-token' });
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Error' } });

      const user = await getCurrentUserFromRequest();
      expect(user).toBeNull();
    });
    
    it('should return null and log error if unexpected error occurs', async () => {
        mockHeaders.mockRejectedValue(new Error('Unexpected'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = await getCurrentUserFromRequest();
        expect(user).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Error getting current user from request:', expect.any(Error));
    });
  });
});