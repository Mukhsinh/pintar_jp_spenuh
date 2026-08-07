import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kwgyhedinqisgimdvzlu.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function ensureSuperAdmin(email: string, fullName: string, code: string) {
    console.log(`\n🚀 Ensuring superadmin: ${email}...`)
    const password = 'admin123'
    const role = 'superadmin'

    let userId: string | undefined

    const { data: users, error: listError } = await supabase.auth.admin.listUsers()
    if (!listError) {
        const existing = users.users.find(u => u.email === email)
        if (existing) {
            userId = existing.id
            await supabase.auth.admin.updateUserById(userId, {
                password: password,
                email_confirm: true,
                user_metadata: { full_name: fullName, role: role }
            })
            console.log(`✅ Updated Auth user ${email} (ID: ${userId})`)
        }
    }

    if (!userId) {
        const { data: authData, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, role: role }
        })
        if (createError) throw createError
        userId = authData.user.id
        console.log(`✅ Created Auth user ${email} (ID: ${userId})`)
    }

    // Get Superadmin unit
    const { data: units } = await supabase
        .from('m_units')
        .select('id')
        .in('code', ['ADMIN', 'IT'])

    const unitId = units && units.length > 0 ? units[0].id : null

    const { error: empError } = await supabase
        .from('m_employees')
        .upsert({
            employee_code: code,
            full_name: fullName,
            unit_id: unitId,
            role: role,
            email: email,
            user_id: userId,
            tax_status: 'TK/0',
            is_active: true
        }, {
            onConflict: 'email'
        })

    if (empError) throw empError
    console.log(`✅ Employee record linked for ${email}`)
}

async function main() {
    await ensureSuperAdmin('admin@sungaipenuh.com', 'Admin Sungai Penuh', 'SA_SP01')
    await ensureSuperAdmin('admin@sungaibahar.com', 'Admin Sungai Bahar', 'SA_SB01')
    console.log('\n🎉 ALL SUPERADMIN USERS READY!')
}

main().catch(console.error)
