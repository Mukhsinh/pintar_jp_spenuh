import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const anonClient = createClient(supabaseUrl, anonKey)
const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function testLogin() {
    console.log('--- Testing Anon Client Login ---')
    const { data: anonData, error: anonErr } = await anonClient.auth.signInWithPassword({
        email: 'admin@sungaipenuh.com',
        password: 'password'
    })
    console.log('Anon client result:', anonErr ? anonErr.message : 'SUCCESS')

    console.log('\n--- Testing Admin Client Login ---')
    const { data: adminData, error: adminErr } = await adminClient.auth.signInWithPassword({
        email: 'admin@sungaipenuh.com',
        password: 'password'
    })
    console.log('Admin client result:', adminErr ? adminErr.message : 'SUCCESS')

    process.exit(0)
}

testLogin()
