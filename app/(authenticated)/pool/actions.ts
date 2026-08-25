'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generatePoolOverviewPDF } from '@/lib/export/pdf-export'

export async function exportPoolReportToPDF(poolId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            throw new Error('Unauthorized')
        }

        const adminClient = await createAdminClient()

        // 1. Get pool metadata
        const { data: pool, error: poolError } = await adminClient
            .from('t_pool')
            .select('*')
            .eq('id', poolId)
            .single()

        if (poolError || !pool) {
            throw new Error(`Pool not found: ${poolError?.message}`)
        }

        // 2. Get revenue items
        const { data: revenueItems, error: revError } = await adminClient
            .from('t_pool_revenue')
            .select('*')
            .eq('pool_id', poolId)
            .order('created_at')

        if (revError) throw revError

        // 3. Get deduction items
        const { data: deductionItems, error: dedError } = await adminClient
            .from('t_pool_deduction')
            .select('*')
            .eq('pool_id', poolId)
            .order('created_at')

        if (dedError) throw dedError

        // 4. Generate PDF
        const pdfBytes = await generatePoolOverviewPDF({
            pool,
            revenueItems: revenueItems || [],
            deductionItems: deductionItems || []
        })

        // 5. Convert to base64 for transport
        return {
            success: true,
            data: Buffer.from(pdfBytes).toString('base64'),
            filename: `Laporan_Pool_${pool.period.replace(/\//g, '-')}.pdf`
        }

    } catch (error: any) {
        console.error('exportPoolReportToPDF error:', error)
        return {
            success: false,
            error: error.message || 'Gagal menghasilkan PDF'
        }
    }
}

export async function createPoolAction(formData: { period: string; global_allocation_percentage: number }) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: 'Tidak terautentikasi' }
        }

        const adminClient = await createAdminClient()

        // Check existing pool
        const { data: existingPool } = await adminClient
            .from('t_pool')
            .select('id')
            .eq('period', formData.period)
            .maybeSingle()

        if (existingPool) {
            return { success: false, error: 'Pool sudah ada untuk periode ini' }
        }

        // Insert new pool using admin client
        const { data, error } = await adminClient
            .from('t_pool')
            .insert({
                period: formData.period,
                global_allocation_percentage: formData.global_allocation_percentage,
                revenue_total: 0,
                deduction_total: 0,
                status: 'draft'
            })
            .select()
            .single()

        if (error) throw error

        return { success: true, data }
    } catch (error: any) {
        console.error('createPoolAction error:', error)
        return { success: false, error: error.message || 'Gagal membuat pool' }
    }
}
