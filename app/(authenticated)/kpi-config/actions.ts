'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

async function checkIsSuperAdmin(user: any, supabase: any): Promise<boolean> {
    if (!user) return false
    const email = user.email || ''
    const metaRole = user.app_metadata?.role || user.user_metadata?.role
    if (metaRole === 'superadmin' || email === 'admin@sungaibahar.com' || email === 'admin@soeselors.com') {
        return true
    }

    try {
        const adminClient = await createAdminClient()
        const { data: emp } = await adminClient
            .from('m_employees')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle()

        return emp?.role === 'superadmin'
    } catch (e) {
        return false
    }
}

export async function getUnitsForKPI() {
    try {
        const adminClient = await createAdminClient()

        const { data, error } = await adminClient
            .from('m_units')
            .select('id, code, name')
            .eq('is_active', true)
            .neq('code', 'ADMIN')
            .neq('name', 'SUPERADMIN')
            .order('code')

        if (error) throw error

        let filteredUnits = data || []
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const isSuperAdmin = await checkIsSuperAdmin(user, supabase)
                const userUnitId = user.user_metadata?.unit_id || user.app_metadata?.unit_id
                if (!isSuperAdmin && (user.user_metadata?.role === 'unit_manager' || user.app_metadata?.role === 'unit_manager') && userUnitId) {
                    filteredUnits = filteredUnits.filter(u => u.id === userUnitId)
                }
            }
        } catch (e) {
            // Ignore auth check error, return active units
        }

        return { data: filteredUnits }
    } catch (error: any) {
        console.error('getUnitsForKPI error:', error)
        return { data: [], error: error.message || 'Gagal memuat unit' }
    }
}

export async function getKPIStructure(unitId: string) {
    try {
        if (!unitId) return { categories: [], indicators: [], subIndicators: [], error: 'Unit ID tidak valid' }

        const adminClient = await createAdminClient()

        // 1. Get Categories for the unit
        const categoriesResult = await adminClient
            .from('m_kpi_categories')
            .select('*')
            .eq('unit_id', unitId)
            .order('category')

        if (categoriesResult.error) {
            console.error('m_kpi_categories fetch error:', categoriesResult.error)
            return { categories: [], indicators: [], subIndicators: [], error: categoriesResult.error.message }
        }
        const categories = categoriesResult.data || []

        if (!categories || categories.length === 0) {
            return { categories: [], indicators: [], subIndicators: [] }
        }

        const categoryIds = categories.map(c => c.id)

        // 2. Get Indicators for those categories
        const indicatorsResult = await adminClient
            .from('m_kpi_indicators')
            .select('*')
            .in('category_id', categoryIds)
            .order('code')

        if (indicatorsResult.error) {
            console.error('m_kpi_indicators fetch error:', indicatorsResult.error)
            return { categories, indicators: [], subIndicators: [], error: indicatorsResult.error.message }
        }
        const indicators = indicatorsResult.data || []

        const indicatorIds = indicators.map(i => i.id)

        // 3. Get Sub Indicators for those indicators
        let subIndicators: any[] = []
        if (indicatorIds.length > 0) {
            const subIndicatorsResult = await adminClient
                .from('m_kpi_sub_indicators')
                .select('*')
                .in('indicator_id', indicatorIds)
                .order('code')

            if (subIndicatorsResult.error) {
                console.error('m_kpi_sub_indicators fetch error:', subIndicatorsResult.error)
                return { categories, indicators, subIndicators: [], error: subIndicatorsResult.error.message }
            }
            subIndicators = subIndicatorsResult.data || []
        }

        return {
            categories,
            indicators,
            subIndicators
        }
    } catch (error: any) {
        console.error('getKPIStructure error:', error)
        return {
            categories: [],
            indicators: [],
            subIndicators: [],
            error: error.message || 'Gagal memuat struktur KPI'
        }
    }
}

