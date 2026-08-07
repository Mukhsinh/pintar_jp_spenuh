import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kwgyhedinqisgimdvzlu.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testCheck() {
    console.log('🔍 Testing settings save check for superadmins...\n')

    const emails = ['admin@sungaipenuh.com', 'admin@sungaibahar.com']

    for (const email of emails) {
        const { data: emp, error } = await supabase
            .from('m_employees')
            .select('id, email, role, user_id')
            .eq('email', email)
            .maybeSingle()

        console.log(`Email: ${email}`)
        if (error) {
            console.error(' Error:', error)
        } else {
            console.log(' Employee record:', emp)
        }
    }
}

testCheck()
