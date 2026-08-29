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
    -- Upgrade precision for KPI master and assessment tables to 4 decimal places
    ALTER TABLE m_kpi_indicators 
      ALTER COLUMN base_index_value TYPE NUMERIC(15,4),
      ALTER COLUMN unit_tariff TYPE NUMERIC(15,4),
      ALTER COLUMN target_value TYPE NUMERIC(15,4);

    ALTER TABLE m_kpi_sub_indicators 
      ALTER COLUMN base_index_value TYPE NUMERIC(15,4),
      ALTER COLUMN unit_tariff TYPE NUMERIC(15,4),
      ALTER COLUMN target_value TYPE NUMERIC(15,4);

    ALTER TABLE t_kpi_assessments 
      ALTER COLUMN realization_value TYPE NUMERIC(15,4),
      ALTER COLUMN target_value TYPE NUMERIC(15,4),
      ALTER COLUMN achievement_percentage TYPE NUMERIC(10,4),
      ALTER COLUMN score TYPE NUMERIC(15,4);

    ALTER TABLE t_realization 
      ALTER COLUMN realization_value TYPE NUMERIC(15,4),
      ALTER COLUMN achievement_percentage TYPE NUMERIC(10,4),
      ALTER COLUMN score TYPE NUMERIC(15,4);

    NOTIFY pgrst, 'reload schema';
    `

    await runSql(sql)
}

main().catch(console.error)
