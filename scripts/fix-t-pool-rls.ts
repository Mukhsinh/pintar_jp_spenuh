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
    -- 1. Enable RLS on pool tables
    ALTER TABLE t_pool ENABLE ROW LEVEL SECURITY;
    ALTER TABLE t_pool_revenue ENABLE ROW LEVEL SECURITY;
    ALTER TABLE t_pool_deduction ENABLE ROW LEVEL SECURITY;

    -- 2. Drop existing policies to avoid conflicts
    DROP POLICY IF EXISTS "Allow all for authenticated" ON t_pool;
    DROP POLICY IF EXISTS "Allow all for authenticated" ON t_pool_revenue;
    DROP POLICY IF EXISTS "Allow all for authenticated" ON t_pool_deduction;

    DROP POLICY IF EXISTS "Enable all access for authenticated users" ON t_pool;
    DROP POLICY IF EXISTS "Enable all access for authenticated users" ON t_pool_revenue;
    DROP POLICY IF EXISTS "Enable all access for authenticated users" ON t_pool_deduction;

    DROP POLICY IF EXISTS "Enable full access for authenticated users on t_pool" ON t_pool;
    DROP POLICY IF EXISTS "Enable full access for authenticated users on t_pool_revenue" ON t_pool_revenue;
    DROP POLICY IF EXISTS "Enable full access for authenticated users on t_pool_deduction" ON t_pool_deduction;

    -- 3. Create permissive policies for authenticated users
    CREATE POLICY "Enable full access for authenticated users on t_pool"
    ON t_pool FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Enable full access for authenticated users on t_pool_revenue"
    ON t_pool_revenue FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

    CREATE POLICY "Enable full access for authenticated users on t_pool_deduction"
    ON t_pool_deduction FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

    -- 4. Also grant access to anon role for read if needed
    DROP POLICY IF EXISTS "Enable read access for anon on t_pool" ON t_pool;
    CREATE POLICY "Enable read access for anon on t_pool"
    ON t_pool FOR SELECT
    TO anon
    USING (true);

    NOTIFY pgrst, 'reload schema';
    `

    await runSql(sql)
}

main().catch(console.error)
