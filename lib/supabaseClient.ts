import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  // Return existing instance if already created
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build/prerender (when window is undefined), allow build to proceed
  // by creating a client with placeholder values if env vars are missing
  const isBuildTime = typeof window === "undefined";
  
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isBuildTime) {
      // During build, create a client with placeholder values to allow build to succeed
      // The actual values will be available at runtime in production
      supabaseInstance = createClient(
        "https://placeholder.supabase.co",
        "placeholder-anon-key"
      );
      return supabaseInstance;
    } else {
      // At runtime in browser, throw error if env vars are missing
      throw new Error(
        "Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables."
      );
    }
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// Export a Proxy that lazily initializes the client only when properties are accessed
// This prevents the client from being initialized during module evaluation/build time
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    // Bind functions to maintain correct 'this' context
    return typeof value === "function" ? value.bind(client) : value;
  },
});

