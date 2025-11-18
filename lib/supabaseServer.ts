import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";

// Helper to get user ID from request headers (for API routes)
// The client should send the access token in Authorization header
export async function getUserIdFromRequest(): Promise<string | null> {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    
    const token = authHeader.substring(7);
    
    // Create a Supabase client to verify the token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
    
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    console.error("Error getting user ID from request:", error);
    return null;
  }
}

// Helper to get full user object from request
export async function getCurrentUserFromRequest(): Promise<User | null> {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    
    const token = authHeader.substring(7);
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
    
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return null;
    }
    
    return user;
  } catch (error) {
    console.error("Error getting current user from request:", error);
    return null;
  }
}

