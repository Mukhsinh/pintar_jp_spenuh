import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const url = 'https://hatrvqeihrjczsqxmfqf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdHJ2cWVpaHJqY3pzcXhtZnFmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTE4Mjc3MCwiZXhwIjoyMTAwNzU4NzcwfQ.nRdBYzFXOuEMbl100XxJ1k4FSzkgGe7anptMC9CS2WY';

const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

function parseSqlInsertValues(sqlContent: string): { columns: string[]; rows: any[][] } {
    const colsMatch = sqlContent.match(/INSERT\s+INTO\s+"?[^"\s]+"?(?:\."?[^"\s]+"?)?\s*\(([^)]+)\)\s*VALUES/i);
    if (!colsMatch) throw new Error('Could not find INSERT INTO columns');

    const columns = colsMatch[1].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const valuesIdx = sqlContent.toUpperCase().indexOf('VALUES');
    const valuesStr = sqlContent.slice(valuesIdx + 6).trim();

    const rows: any[][] = [];
    let currentRow: any[] = [];
    let inString = false;
    let currentVal = '';
    let inArray = false;
    let arrayVals: string[] = [];
    let justFinishedArray = false;
    let depth = 0;

    let i = 0;
    while (i < valuesStr.length) {
        const char = valuesStr[i];

        if (depth === 0) {
            if (char === '(') {
                depth = 1;
                currentRow = [];
                currentVal = '';
                inString = false;
                inArray = false;
                justFinishedArray = false;
            }
            i++;
            continue;
        }

        if (inString) {
            if (char === "'" && valuesStr[i + 1] === "'") {
                currentVal += "'";
                i += 2;
                continue;
            } else if (char === "'") {
                inString = false;
                i++;
                continue;
            } else {
                currentVal += char;
                i++;
                continue;
            }
        }

        if (char === "'") {
            inString = true;
            i++;
            continue;
        }

        if (!inString && valuesStr.slice(i, i + 6).toUpperCase() === 'ARRAY[') {
            inArray = true;
            arrayVals = [];
            currentVal = '';
            i += 6;
            continue;
        }

        if (inArray) {
            if (char === ']') {
                inArray = false;
                if (currentVal.trim()) {
                    arrayVals.push(currentVal.trim().replace(/^'|'$/g, ''));
                    currentVal = '';
                }
                currentRow.push(arrayVals);
                justFinishedArray = true;
                i++;
                continue;
            } else if (char === ',') {
                if (currentVal.trim()) {
                    arrayVals.push(currentVal.trim().replace(/^'|'$/g, ''));
                    currentVal = '';
                }
                i++;
                continue;
            }
        }

        if (char === ',' && depth === 1) {
            if (justFinishedArray) {
                justFinishedArray = false;
            } else {
                currentRow.push(parseValue(currentVal));
            }
            currentVal = '';
            i++;
            continue;
        }

        if (char === ')' && depth === 1) {
            if (justFinishedArray) {
                justFinishedArray = false;
            } else {
                currentRow.push(parseValue(currentVal));
            }
            rows.push(currentRow);
            depth = 0;
            currentVal = '';
            i++;
            continue;
        }

        currentVal += char;
        i++;
    }

    return { columns, rows };
}

function parseValue(valStr: string): any {
    const trimmed = valStr.trim();
    if (trimmed.toUpperCase() === 'NULL') return null;
    if (trimmed.toUpperCase() === 'TRUE') return true;
    if (trimmed.toUpperCase() === 'FALSE') return false;

    // Clean quotes if wrapped in single quotes
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        const unquoted = trimmed.slice(1, -1).replace(/''/g, "'");
        // Check if JSON
        if (unquoted.startsWith('[') && unquoted.endsWith(']')) {
            try { return JSON.parse(unquoted); } catch { return unquoted; }
        }
        return unquoted;
    }

    if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try { return JSON.parse(trimmed); } catch { return trimmed; }
    }

    return trimmed;
}

async function runImport() {
    console.log('🚀 Starting KPI SQL Data Import...\n');
    const publicDir = path.join(process.cwd(), 'public');

    try {
        // 1. Categories
        console.log('1. Parsing m_kpi_categories_rows.sql...');
        const catSql = fs.readFileSync(path.join(publicDir, 'm_kpi_categories_rows.sql'), 'utf-8');
        const { columns: catCols, rows: catRows } = parseSqlInsertValues(catSql);
        console.log(`   Found ${catCols.length} columns, ${catRows.length} rows.`);

        const catObjects = catRows.map((row, idx) => {
            const obj: any = {};
            catCols.forEach((col, cIdx) => {
                obj[col] = row[cIdx];
            });
            return obj;
        });

        console.log('   Upserting m_kpi_categories to Supabase...');
        const { error: catErr } = await supabase.from('m_kpi_categories').upsert(catObjects, { onConflict: 'id' });
        if (catErr) {
            console.error('   ❌ Error upserting categories:', catErr);
        } else {
            console.log(`   ✓ Successfully imported ${catObjects.length} categories.`);
        }

        // 2. Indicators
        console.log('\n2. Parsing m_kpi_indicators_rows.sql...');
        const indSql = fs.readFileSync(path.join(publicDir, 'm_kpi_indicators_rows.sql'), 'utf-8');
        const { columns: indCols, rows: indRows } = parseSqlInsertValues(indSql);
        console.log(`   Found ${indCols.length} columns, ${indRows.length} rows.`);

        const indObjects = indRows.map((row, idx) => {
            const obj: any = {};
            indCols.forEach((col, cIdx) => {
                obj[col] = row[cIdx];
            });
            return obj;
        });

        console.log('   Upserting m_kpi_indicators to Supabase...');
        const { error: indErr } = await supabase.from('m_kpi_indicators').upsert(indObjects, { onConflict: 'id' });
        if (indErr) {
            console.error('   ❌ Error upserting indicators:', indErr);
        } else {
            console.log(`   ✓ Successfully imported ${indObjects.length} indicators.`);
        }

        // 3. Sub Indicators
        console.log('\n3. Parsing m_kpi_sub_indicators_rows.sql...');
        const subSql = fs.readFileSync(path.join(publicDir, 'm_kpi_sub_indicators_rows.sql'), 'utf-8');
        const { columns: subCols, rows: subRows } = parseSqlInsertValues(subSql);
        console.log(`   Found ${subCols.length} columns, ${subRows.length} rows.`);

        const subObjects = subRows.map((row, idx) => {
            const obj: any = {};
            subCols.forEach((col, cIdx) => {
                obj[col] = row[cIdx];
            });
            return obj;
        });

        console.log('   Upserting m_kpi_sub_indicators to Supabase...');
        for (let i = 0; i < subObjects.length; i += 50) {
            const batch = subObjects.slice(i, i + 50);
            const { error: subErr } = await supabase.from('m_kpi_sub_indicators').upsert(batch, { onConflict: 'id' });
            if (subErr) {
                console.error(`   ❌ Error upserting sub_indicators batch ${i}:`, subErr);
            } else {
                console.log(`   ✓ Sub-indicators batch ${i}-${i + batch.length} imported.`);
            }
        }

        // Final verification counts
        console.log('\n=============================================');
        const { count: cCount } = await supabase.from('m_kpi_categories').select('*', { head: true, count: 'exact' });
        const { count: iCount } = await supabase.from('m_kpi_indicators').select('*', { head: true, count: 'exact' });
        const { count: sCount } = await supabase.from('m_kpi_sub_indicators').select('*', { head: true, count: 'exact' });

        console.log('📊 Verification Summary:');
        console.log(`   m_kpi_categories:     ${cCount} rows`);
        console.log(`   m_kpi_indicators:     ${iCount} rows`);
        console.log(`   m_kpi_sub_indicators: ${sCount} rows`);
        console.log('=============================================\n');

    } catch (err: any) {
        console.error('Fatal error during import:', err.message || err);
    }
}

runImport();
