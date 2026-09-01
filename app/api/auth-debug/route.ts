import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, { ...options, path: '/' })
                        })
                    } catch (error) { }
                },
            },
        }
    )

    const { data: { user }, error } = await supabase.auth.getUser()

    return Response.json({
        hasUser: !!user,
        error: error?.message,
        cookiesFound: cookieStore.getAll().map(c => c.name)
    })
}
