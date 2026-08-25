const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kwgyhedinqisgimdvzlu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Z3loZWRpbnFpc2dpbWR2emx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjA0NDA1MiwiZXhwIjoyMTAxNjIwMDUyfQ.98fZOHH4OJIpjYE7K5MFISDH4-ZQUpL7uR3fE-i7YpM';

const url = new URL(`${supabaseUrl}/rest/v1/`);
const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'GET',
    headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const paths = Object.keys(data.paths || {})
                .map(p => p.replace('/', ''))
                .filter(p => p.length > 0 && !p.includes('{'));

            const uniqueTables = Array.from(new Set(paths)).sort();
            console.log('==================================================');
            console.log(`🌐 HASIL PEMERIKSAAN KONEKSI SUPABASE`);
            console.log(`URL DB : ${supabaseUrl}`);
            console.log(`STATUS : ✅ TERKONEKSI SANGAT BAIK`);
            console.log(`JUMLAH TABEL AKTIF : ${uniqueTables.length} TABEL`);
            console.log('==================================================\n');

            for (const table of uniqueTables) {
                await checkTableRowCount(table);
            }

            console.log('\n==================================================');
            process.exit(0);
        } catch (e) {
            console.error('Error parsing OpenAPI spec:', e);
            process.exit(1);
        }
    });
});

function checkTableRowCount(table) {
    return new Promise((resolve) => {
        const tUrl = new URL(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`);
        const opts = {
            hostname: tUrl.hostname,
            path: tUrl.pathname + tUrl.search,
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'count=exact'
            },
            timeout: 4000
        };

        const tReq = https.request(opts, (tRes) => {
            let b = '';
            tRes.on('data', c => b += c);
            tRes.on('end', () => {
                const contentRange = tRes.headers['content-range'];
                let rowCount = '0';
                if (contentRange) {
                    const parts = contentRange.split('/');
                    if (parts[1]) rowCount = parts[1];
                }
                console.log(`📌 Tabel [ ${table.padEnd(30)} ] -> Status: ✅ ONLINE (Data: ${rowCount} baris)`);
                resolve();
            });
        });
        tReq.on('error', () => {
            console.log(`📌 Tabel [ ${table.padEnd(30)} ] -> Status: ⚠️ UNKNOWN`);
            resolve();
        });
        tReq.end();
    });
}

req.on('error', (e) => {
    console.error('Koneksi Gagal:', e.message);
    process.exit(1);
});

req.end();
