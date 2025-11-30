import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAuthHeaders, authenticatedFetch } from './apiClient';

// Mock the supabase client
const mockGetSession = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

describe('apiClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset global fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthHeaders', () => {
    it('should return headers with Authorization token when session exists', async () => {
      const mockToken = 'mock-access-token';
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: mockToken,
          },
        },
      });

      const headers = await getAuthHeaders();

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`,
      });
    });

    it('should return only Content-Type when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: null,
        },
      });

      const headers = await getAuthHeaders();

      expect(headers).toEqual({
        'Content-Type': 'application/json',
      });
    });
  });

  describe('authenticatedFetch', () => {
    it('should call fetch with auth headers', async () => {
      const mockToken = 'mock-token';
      const mockUrl = '/api/test';
      
      mockGetSession.mockResolvedValue({
        data: {
          session: { access_token: mockToken },
        },
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'success' }),
      });

      await authenticatedFetch(mockUrl);

      expect(global.fetch).toHaveBeenCalledWith(mockUrl, expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockToken}`,
        },
      }));
    });

    it('should merge custom headers with auth headers', async () => {
      const mockToken = 'mock-token';
      const mockUrl = '/api/test';
      
      mockGetSession.mockResolvedValue({
        data: {
          session: { access_token: mockToken },
        },
      });

      await authenticatedFetch(mockUrl, {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(mockUrl, expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockToken}`,
          'X-Custom-Header': 'custom-value',
        },
      }));
    });

    it('should pass through other fetch options', async () => {
      const mockUrl = '/api/test';
      const mockMethod = 'POST';
      const mockBody = JSON.stringify({ foo: 'bar' });

      mockGetSession.mockResolvedValue({ data: { session: null } });

      await authenticatedFetch(mockUrl, {
        method: mockMethod,
        body: mockBody,
      });

      expect(global.fetch).toHaveBeenCalledWith(mockUrl, expect.objectContaining({
        method: mockMethod,
        body: mockBody,
      }));
    });
  });
});
