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

async function main() {
    console.log('🚀 Creating user admin@sungaipenuh.com...\n')

    const email = 'admin@sungaipenuh.com'
    const password = 'admin123'
    const fullName = 'Admin Sungai Penuh'
    const employeeCode = 'SA_SP01'
    const role = 'superadmin'

    try {
        // 1. Create or Update user in Supabase Auth
        console.log('📝 Creating/Updating user in Supabase Auth...')
        let userId: string | undefined

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: role
            }
        })

        if (authError) {
            if (authError.message.includes('already registered')) {
                console.log('ℹ️ User already registered in Auth, updating password...')
                // Find user by email
                const { data: users, error: listError } = await supabase.auth.admin.listUsers()
                if (listError) throw listError

                const existingUser = users.users.find(u => u.email === email)
                if (existingUser) {
                    userId = existingUser.id
                    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
                        password: password,
                        email_confirm: true,
                        user_metadata: { full_name: fullName, role: role }
                    })
                    if (updateError) throw updateError
                    console.log(`✅ User password updated for User ID: ${userId}`)
                } else {
                    throw new Error('User reported as registered but could not be found')
                }
            } else {
                throw authError
            }
        } else {
            userId = authData.user.id
            console.log(`✅ User created in Auth with ID: ${userId}`)
        }

        // 2. Ensure unit (ADMIN or IT) exists
        console.log('\n📝 Finding or creating Superadmin unit...')
        let unitId: string | null = null

        // Try finding unit ADMIN or IT
        const { data: units } = await supabase
            .from('m_units')
            .select('id, code, name')
            .in('code', ['ADMIN', 'IT', 'RS001'])

        if (units && units.length > 0) {
            const adminUnit = units.find(u => u.code === 'ADMIN') || units.find(u => u.code === 'IT') || units[0]
            unitId = adminUnit.id
            console.log(`✅ Using unit: ${adminUnit.name} (${adminUnit.code}) [ID: ${unitId}]`)
        } else {
            // Create ADMIN unit
            const { data: newUnit, error: createUnitError } = await supabase
                .from('m_units')
                .insert({
                    code: 'ADMIN',
                    name: 'SUPERADMIN',
                    proportion_percentage: 0.00,
                    is_active: true
                })
                .select('id')
                .single()

            if (createUnitError) throw createUnitError
            unitId = newUnit.id
            console.log(`✅ Created new SUPERADMIN unit with ID: ${unitId}`)
        }

        // 3. Insert or Update m_employees record
        console.log('\n📝 Creating/updating m_employees record...')
        const { error: empError } = await supabase
            .from('m_employees')
            .upsert({
                employee_code: employeeCode,
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
        console.log('✅ Employee record successfully upserted!')

        // 4. Verify employee record
        console.log('\n🔍 Verification Check:')
        const { data: verifyEmp, error: verifyErr } = await supabase
            .from('m_employees')
            .select('id, employee_code, full_name, email, role, user_id, is_active, m_units(name, code)')
            .eq('email', email)
            .single()

        if (verifyErr) throw verifyErr

        console.log('\n----------------------------------------')
        console.log('🎉 USER SUPERADMIN SUCCESSFULLY CREATED!')
        console.log('----------------------------------------')
        console.log(`📧 Email       : ${verifyEmp.email}`)
        console.log(`🔑 Password    : ${password}`)
        console.log(`👤 Name        : ${verifyEmp.full_name}`)
        console.log(`🏷️ Code        : ${verifyEmp.employee_code}`)
        console.log(`🛡️ Role        : ${verifyEmp.role}`)
        console.log(`🏢 Unit        : ${Array.isArray(verifyEmp.m_units) ? verifyEmp.m_units[0]?.name : (verifyEmp.m_units as any)?.name}`)
        console.log(`🆔 User ID     : ${verifyEmp.user_id}`)
        console.log(`STATUS         : ${verifyEmp.is_active ? 'ACTIVE' : 'INACTIVE'}`)
        console.log('----------------------------------------')

    } catch (err: any) {
        console.error('❌ Error creating user:', err.message || err)
        process.exit(1)
    }
}

main()
