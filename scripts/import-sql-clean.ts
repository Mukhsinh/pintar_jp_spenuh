import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0] || 'kwgyhedinqisgimdvzlu'
const accessToken = process.env.SUPABASE_ACCESS_TOKEN_KEY

if (!accessToken) {
    console.error('❌ SUPABASE_ACCESS_TOKEN_KEY not set in .env.local')
    process.exit(1)
}

async function runSql(sqlQuery: string, label: string): Promise<boolean> {
    console.log(`\n⏳ Executing SQL import for: ${label}...`)

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sqlQuery })
    })

    const resultText = await response.text()
    if (!response.ok) {
        console.error(`❌ HTTP ${response.status} for ${label}:\n${resultText}`)
        return false
    }

    console.log(`✅ Success for ${label}!`)
    return true
}

async function main() {
    console.log(`🚀 Starting Complete Master Data Import from public/*.sql to Supabase project [${projectRef}]...\n`)

    // 1. Ensure any missing helper columns exist
    const prepSql = `
    ALTER TABLE m_kpi_indicators ADD COLUMN IF NOT EXISTS schema_cache_refresh_v2 TEXT;
    ALTER TABLE m_kpi_sub_indicators ADD COLUMN IF NOT EXISTS schema_cache_refresh_v2 TEXT;
  `
    await runSql(prepSql, 'Schema Preparation')

    const files = [
        'm_units_rows.sql',
        'm_kpi_categories_rows.sql',
        'm_kpi_indicators_rows.sql',
        'm_kpi_sub_indicators_rows.sql'
    ]

    for (const fileName of files) {
        const filePath = path.join(process.cwd(), 'public', fileName)
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`)
            continue
        }

        let sql = fs.readFileSync(filePath, 'utf-8').trim()

        // Explicitly cast PostgreSQL ARRAY[...] literals to text[] to avoid 42P18 error
        sql = sql.replace(/ARRAY\[(.*?)\]/g, "ARRAY[$1]::text[]")

        // Trim trailing semicolon if present
        sql = sql.replace(/;\s*$/, '')

        // Check if ON CONFLICT is already at the very end of statement
        if (!sql.slice(-50).toLowerCase().includes('on conflict')) {
            sql += ' ON CONFLICT DO NOTHING;'
        } else {
            sql += ';'
        }

        await runSql(sql, fileName)
    }

    console.log('\n🔍 Verifying final row counts in database...')
    const verifySql = `
    SELECT 
      (SELECT COUNT(*) FROM m_units) as count_units,
      (SELECT COUNT(*) FROM m_kpi_categories) as count_categories,
      (SELECT COUNT(*) FROM m_kpi_indicators) as count_indicators,
      (SELECT COUNT(*) FROM m_kpi_sub_indicators) as count_sub_indicators;
  `

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: verifySql })
    })

    if (response.ok) {
        const stats = await response.json()
        console.log('\n📊 FINAL VERIFICATION STATS:')
        console.log(JSON.stringify(stats, null, 2))
    }

    console.log('\n🎉 ALL PUBLIC MASTER DATA SUCCESSFULLY IMPORTED AND INTEGRATED!')
}

main().catch(console.error)
