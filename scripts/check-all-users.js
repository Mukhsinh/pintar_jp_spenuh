const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function checkUsers() {
    console.log('--- Checking Auth Users ---')
    const { data: authUsers, error: authErr } = await adminClient.auth.admin.listUsers()
    if (authErr) {
        console.error('Error listing auth users:', authErr.message)
    } else {
        console.log(`Found ${authUsers.users.length} auth users:`)
        authUsers.users.forEach(u => {
            console.log(`- ID: ${u.id} | Email: ${u.email} | Role: ${u.user_metadata?.role || u.app_metadata?.role || 'none'}`)
        })
    }

    console.log('\n--- Checking m_employees ---')
    const { data: emps, error: empErr } = await adminClient.from('m_employees').select('id, full_name, email, user_id, role, is_active')
    if (empErr) {
        console.error('Error listing employees:', empErr.message)
    } else {
        console.log(`Found ${emps.length} employees:`)
        emps.forEach(e => {
            console.log(`- ID: ${e.id} | Name: ${e.full_name} | Email: ${e.email} | UserID: ${e.user_id} | Role: ${e.role} | Active: ${e.is_active}`)
        })
    }
}

checkUsers()
