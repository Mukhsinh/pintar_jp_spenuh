import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const email = url.searchParams.get('email') || 'admin@sungaipenuh.com'
    const password = url.searchParams.get('password') || 'admin123'

    const supabase = await createClient()

    const { data: auth, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return NextResponse.json({ success: false, error: error.message })
    }

    // The cookie should have been set by createClient's setAll automatically!
    return NextResponse.json({ success: true, user: auth.user.email })
}
