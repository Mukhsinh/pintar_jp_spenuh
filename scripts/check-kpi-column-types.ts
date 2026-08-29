import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkColumns() {
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const tables = ['m_kpi_indicators', 'm_kpi_sub_indicators', 't_kpi_assessments']

    for (const table of tables) {
        console.log(`\n--- ${table} ---`)
        const { data, error } = await supabase.rpc('execute_sql', {
            sql_query: `SELECT column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = '${table}';`
        })
        if (error) {
            // try direct select sample row if rpc not available
            const { data: sample, error: sampleError } = await supabase.from(table).select('*').limit(1)
            console.log('Sample row:', sample ? Object.keys(sample[0] || {}) : sampleError)
        } else {
            console.table(data)
        }
    }
}

checkColumns().catch(console.error)
