import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0] || 'kwgyhedinqisgimdvzlu'
const accessToken = process.env.SUPABASE_ACCESS_TOKEN_KEY

async function runSql(sqlQuery: string) {
    console.log('Sending SQL to Supabase Management API for project:', projectRef)

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sqlQuery })
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ HTTP ${response.status}: ${errorText}`)
        return false
    }

    const result = await response.json()
    console.log('✅ Query executed successfully:', result)
    return true
}

async function main() {
    const sql = `
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale 
    FROM information_schema.columns 
    WHERE table_name IN ('m_kpi_indicators', 'm_kpi_sub_indicators', 't_kpi_assessments', 't_realization')
      AND column_name IN ('base_index_value', 'unit_tariff', 'realization_value', 'target_value', 'score', 'achievement_percentage');
    `

    await runSql(sql)
}

main().catch(console.error)
