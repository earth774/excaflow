import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock createClient
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

describe('supabaseClient', () => {
  const originalEnv = process.env;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalWindow: any;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    originalWindow = global.window;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('should reuse existing instance', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'url';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'key';
    const { supabase } = await import('./supabaseClient');
    
    // First access triggers initialization
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _1 = supabase.auth;
    
    // Second access should reuse instance
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _2 = supabase.auth;
    
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('should bind functions to client context', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'url';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'key';
    const mockAuth = { signIn: vi.fn() };
    (createClient as any).mockReturnValue({ auth: { signIn: mockAuth.signIn } });
    
    const { supabase } = await import('./supabaseClient');
    
    // Access a function property
    const signIn = (supabase.auth as any).signIn;
    expect(typeof signIn).toBe('function');
  });

  it('should return property value directly if not a function', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'url';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'key';
    (createClient as any).mockReturnValue({ someProp: 'someValue' });
    
    const { supabase } = await import('./supabaseClient');
    expect((supabase as any).someProp).toBe('someValue');
  });

  describe('Environment Variables Handling', () => {
    it('should throw error if env vars missing in browser environment', async () => {
      // Simulate browser
      global.window = {} as any;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
      const { supabase } = await import('./supabaseClient');
      
      // Trigger the proxy get trap
      expect(() => supabase.auth).toThrow('Missing Supabase environment variables');
    });

    it('should use placeholder in build environment (window undefined) if URL missing', async () => {
      global.window = undefined as any;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'key'; // Key present but URL missing
  
      const { supabase } = await import('./supabaseClient');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = supabase.auth; 
      
      expect(createClient).toHaveBeenCalledWith(
        "https://placeholder.supabase.co",
        "placeholder-anon-key"
      );
    });

    it('should use placeholder in build environment if Key missing', async () => {
      global.window = undefined as any;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'url'; // URL present but Key missing
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
      const { supabase } = await import('./supabaseClient');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = supabase.auth; 
      
      expect(createClient).toHaveBeenCalledWith(
        "https://placeholder.supabase.co",
        "placeholder-anon-key"
      );
    });
  });
});