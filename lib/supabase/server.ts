import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for server-side operations with user context
 * Uses anon key with cookie-based auth for user-scoped operations
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            console.warn(`[SUPABASE COOKIE] Attempting to set ${name}=${value.substring(0, 10)}...`)
            cookieStore.set(name, value, {
              ...options,
              path: '/',
              secure: process.env.NODE_ENV === 'production' ? options.secure : false
            })
          } catch (error) {
            // Ignored if called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', { ...options, path: '/', maxAge: 0 })
          } catch (error) {
            // Ignored if called from Server Component
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase admin client for server-side operations
 * Uses service role key for admin operations (bypasses RLS)
 * ONLY use this for admin operations that require elevated privileges
 */
export async function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
