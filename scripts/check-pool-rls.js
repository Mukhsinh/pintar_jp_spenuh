const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kwgyhedinqisgimdvzlu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z3loZWRpbnFpc2dpbWR2emx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjA0NDA1MiwiZXhwIjoyMTAxNjIwMDUyfQ.98fZOHH4OJIpjYE7K5MFISDH4-ZQUpL7uR3fE-i7YpM';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
    console.log('Checking RLS policies for t_pool, t_pool_revenue, t_pool_deduction...');

    // Try creating a dummy pool row using anon client or check RLS policies via SQL if possible
    const { data, error } = await supabase.rpc('is_superadmin').catch(() => ({ data: null }));
    console.log('rpc is_superadmin available:', !error);

    // Check policies via query to pg_policies if accessible
    const { data: policies, error: polErr } = await supabase
        .from('pg_policies')
        .select('*')
        .in('tablename', ['t_pool', 't_pool_revenue', 't_pool_deduction'])
        .catch(e => ({ data: null, error: e }));

    if (polErr) {
        console.log('Could not query pg_policies directly:', polErr.message);
    } else {
        console.log('Policies found:', policies);
    }

    process.exit(0);
}

checkRLS();
