import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

dotenv.config({ path: '.env.local' })

const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0] || 'kwgyhedinqisgimdvzlu'
const accessToken = process.env.SUPABASE_ACCESS_TOKEN_KEY || ''

function executeSql(sqlQuery: string, description: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n⏳ Executing: ${description}...`)

        const postData = JSON.stringify({ query: sqlQuery })

        const options: https.RequestOptions = {
            hostname: 'api.supabase.com',
            path: `/v1/projects/${projectRef}/database/query`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            family: 4
        }

        const req = https.request(options, (res) => {
            let responseBody = ''
            res.on('data', (chunk) => {
                responseBody += chunk
            })

            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Success: ${description}`)
                    if (description.includes('Verification')) {
                        console.log(`📊 Statistics:\n`, responseBody)
                    }
                    resolve(true)
                } else {
                    console.error(`❌ Failed (${res.statusCode}): ${responseBody.slice(0, 300)}...`)
                    resolve(false)
                }
            })
        })

        req.on('error', (err) => {
            console.error(`❌ Request Error on ${description}:`, err.message)
            resolve(false)
        })

        req.write(postData)
        req.end()
    })
}

function prepareInsertSql(rawSql: string): string {
    let sql = rawSql.replace(/ARRAY\[\]/g, "ARRAY[]::text[]")
    const trimmed = sql.trim()
    if (trimmed.endsWith(';')) {
        return trimmed.slice(0, -1) + ' ON CONFLICT (id) DO NOTHING;'
    }
    return trimmed + ' ON CONFLICT (id) DO NOTHING;'
}

async function main() {
    console.log(`🚀 Complete Database & Storage Initializer for Supabase Project: ${projectRef}\n`)

    const rootDir = process.cwd()

    // Step 1: Base Schema (schema_perfect.sql)
    const schemaPath = path.join(rootDir, 'supabase', 'schema_perfect.sql')
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
        await executeSql(schemaSql, '1. Base Schema (schema_perfect.sql)')
    }

    // Step 2: Ensure Column Extensions on KPI & Assessment Tables
    const columnExtensionsSql = `
        ALTER TABLE m_kpi_indicators 
        ADD COLUMN IF NOT EXISTS calculation_method VARCHAR(20) DEFAULT 'indexing',
        ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(20) DEFAULT 'scoring',
        ADD COLUMN IF NOT EXISTS unit_tariff DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS base_index_value DECIMAL(15,2) DEFAULT 0;

        ALTER TABLE m_kpi_sub_indicators 
        ADD COLUMN IF NOT EXISTS measurement_type VARCHAR(20) DEFAULT 'scoring',
        ADD COLUMN IF NOT EXISTS unit_tariff DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS base_index_value DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT '{}';

        ALTER TABLE t_kpi_assessments 
        ADD COLUMN IF NOT EXISTS sub_indicator_id UUID REFERENCES m_kpi_sub_indicators(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS sub_assessments JSONB DEFAULT '[]'::jsonb;
    `
    await executeSql(columnExtensionsSql, '2. Column Extensions on KPI & Assessment Tables')

    // Step 3: Import Real Application Data Rows from public/
    // 3a. m_units_rows.sql
    const unitsRowsPath = path.join(rootDir, 'public', 'm_units_rows.sql')
    if (fs.existsSync(unitsRowsPath)) {
        const unitsSql = prepareInsertSql(fs.readFileSync(unitsRowsPath, 'utf-8'))
        await executeSql(unitsSql, '3a. Seed Master Units (m_units_rows.sql)')
    }

    // 3b. m_kpi_categories_rows.sql
    const catRowsPath = path.join(rootDir, 'public', 'm_kpi_categories_rows.sql')
    if (fs.existsSync(catRowsPath)) {
        const catSql = prepareInsertSql(fs.readFileSync(catRowsPath, 'utf-8'))
        await executeSql(catSql, '3b. Seed KPI Categories (m_kpi_categories_rows.sql)')
    }

    // 3c. m_kpi_indicators_rows.sql
    const indRowsPath = path.join(rootDir, 'public', 'm_kpi_indicators_rows.sql')
    if (fs.existsSync(indRowsPath)) {
        const indSql = prepareInsertSql(fs.readFileSync(indRowsPath, 'utf-8'))
        await executeSql(indSql, '3c. Seed KPI Indicators (m_kpi_indicators_rows.sql)')
    }

    // 3d. m_kpi_sub_indicators_rows.sql
    const subRowsPath = path.join(rootDir, 'public', 'm_kpi_sub_indicators_rows.sql')
    if (fs.existsSync(subRowsPath)) {
        const subSql = prepareInsertSql(fs.readFileSync(subRowsPath, 'utf-8'))
        await executeSql(subSql, '3d. Seed KPI Sub-Indicators (m_kpi_sub_indicators_rows.sql)')
    }

    // Step 4: Storage Bucket 'logos' and Public Access Policies
    const storageSetupSql = `
        -- Create logos storage bucket
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
          'logos',
          'logos',
          true,
          5242880, -- 5MB
          ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'image/gif', 'image/x-icon']
        )
        ON CONFLICT (id) DO UPDATE SET 
          public = true,
          file_size_limit = 5242880,
          allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'image/gif', 'image/x-icon'];

        -- Storage policies for logos bucket
        DROP POLICY IF EXISTS "Public View Logos" ON storage.objects;
        CREATE POLICY "Public View Logos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'logos');

        DROP POLICY IF EXISTS "Public Upload Logos" ON storage.objects;
        CREATE POLICY "Public Upload Logos" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'logos');

        DROP POLICY IF EXISTS "Public Update Logos" ON storage.objects;
        CREATE POLICY "Public Update Logos" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'logos');

        DROP POLICY IF EXISTS "Public Delete Logos" ON storage.objects;
        CREATE POLICY "Public Delete Logos" ON storage.objects FOR DELETE TO public USING (bucket_id = 'logos');
    `
    await executeSql(storageSetupSql, '4. Storage Bucket (logos) & Policies')

    // Step 5: Default Application & Company Branding Settings
    const settingsSql = `
        INSERT INTO t_settings (key, value, description)
        VALUES 
        (
            'company_info',
            '{"name": "Pintar Klinik @2026", "address": "Jl. Kesehatan No. 1", "phone": "021-12345678", "email": "info@jaspel.co.id", "logo_url": ""}'::jsonb,
            'Company branding & contact information'
        ),
        (
            'application_branding',
            '{"title": "Pintar Klinik @2026", "subtitle": "Mukhsin Hadi. All Right Reserved"}'::jsonb,
            'Application branding'
        )
        ON CONFLICT (key) DO NOTHING;
    `
    await executeSql(settingsSql, '5. Default t_settings Configuration')

    // Step 6: Verify Database Counts
    const verifySql = `
        SELECT 
            (SELECT COUNT(*) FROM m_units) as count_units,
            (SELECT COUNT(*) FROM m_employees) as count_employees,
            (SELECT COUNT(*) FROM m_kpi_categories) as count_categories,
            (SELECT COUNT(*) FROM m_kpi_indicators) as count_indicators,
            (SELECT COUNT(*) FROM m_kpi_sub_indicators) as count_sub_indicators,
            (SELECT COUNT(*) FROM t_settings) as count_settings,
            (SELECT COUNT(*) FROM storage.buckets WHERE id = 'logos') as count_logos_bucket;
    `
    await executeSql(verifySql, '6. Verification Summary Check')

    console.log('\n🎉 DATABASE & STORAGE SETUP COMPLETE!')
}

main().catch(console.error)
