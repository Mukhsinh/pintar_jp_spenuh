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

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ HTTP ${response.status} for ${label}: ${errorText}`)
        return false
    }

    const result = await response.json()
    console.log(`✅ Success for ${label}!`)
    return true
}

async function main() {
    console.log(`🚀 Starting Full Data Import from public/*.sql to Supabase project [${projectRef}]...\n`)

    const files = [
        { name: 'm_units_rows.sql', table: 'm_units' },
        { name: 'm_kpi_categories_rows.sql', table: 'm_kpi_categories' },
        { name: 'm_kpi_indicators_rows.sql', table: 'm_kpi_indicators' },
        { name: 'm_kpi_sub_indicators_rows.sql', table: 'm_kpi_sub_indicators' },
    ]

    for (const item of files) {
        const filePath = path.join(process.cwd(), 'public', item.name)
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`)
            continue
        }

        let sql = fs.readFileSync(filePath, 'utf-8').trim()

        // Add ON CONFLICT (id) DO NOTHING if not present
        if (!sql.toLowerCase().includes('on conflict')) {
            if (sql.endsWith(';')) {
                sql = sql.slice(0, -1) + ' ON CONFLICT (id) DO NOTHING;'
            } else {
                sql += ' ON CONFLICT (id) DO NOTHING;'
            }
        }

        const success = await runSql(sql, item.name)
        if (!success) {
            console.warn(`⚠️ Warning: ${item.name} import reported an issue, continuing...`)
        }
    }

    // Verification
    console.log('\n🔍 Verifying imported data counts...')
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
        const data = await response.json()
        console.log('\n📊 IMPORT VERIFICATION STATS:')
        console.log(JSON.stringify(data, null, 2))
    } else {
        console.error('❌ Failed to run verification query')
    }

    console.log('\n🎉 ALL PUBLIC DATA IMPORT COMPLETED!')
}

main().catch(console.error)
