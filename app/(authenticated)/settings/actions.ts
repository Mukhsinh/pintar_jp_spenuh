'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface SettingsPayload {
  company_info: {
    appName: string
    developerName: string
    name: string
    address: string
    phone: string
    email: string
    logo: string
  }
  footer: { text: string; show?: boolean }
  tax_rates: {
    TK0: number
    TK1: number
    TK2: number
    TK3: number
    K0: number
    K1: number
    K2: number
    K3: number
  }
  ter_rates: { categoryA: number; categoryB: number; categoryC: number }
  calculation_params: { minScore: number; maxScore: number }
  session_timeout: { hours: number }
  tax_config: { mechanism: string }
}

export async function saveSettings(
  payload: SettingsPayload
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Verify caller user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Tidak terautentikasi' }

  const adminClient = await createAdminClient()

  // Check superadmin privileges from metadata, email, or m_employees
  let isSuperAdmin = false
  let updatedBy: string | null = null

  const metaRole = user.user_metadata?.role || user.app_metadata?.role
  const userEmail = user.email || ''

  if (
    metaRole === 'superadmin' ||
    userEmail === 'admin@sungaipenuh.com' ||
    userEmail === 'admin@sungaibahar.com' ||
    userEmail === 'admin@soeselors.com'
  ) {
    isSuperAdmin = true
  }

  try {
    const { data: emp } = await adminClient
      .from('m_employees')
      .select('id, role')
      .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle()

    if (emp) {
      if (emp.role === 'superadmin') {
        isSuperAdmin = true
      }
      updatedBy = emp.id
    }
  } catch (err) {
    console.warn('Error fetching employee record for settings save check:', err)
  }

  if (!isSuperAdmin) {
    return { success: false, error: 'Akses ditolak: hanya superadmin' }
  }

  const now = new Date().toISOString()

  const entries = [
    { key: 'company_info', value: payload.company_info },
    { key: 'footer', value: { text: payload.footer.text, show: payload.footer.show ?? true } },
    { key: 'tax_rates', value: payload.tax_rates },
    { key: 'ter_rates', value: payload.ter_rates },
    { key: 'calculation_params', value: payload.calculation_params },
    { key: 'session_timeout', value: payload.session_timeout },
    { key: 'tax_config', value: payload.tax_config },
  ]

  for (const entry of entries) {
    const { error } = await adminClient
      .from('t_settings')
      .upsert(
        { key: entry.key, value: entry.value, updated_by: updatedBy, updated_at: now },
        { onConflict: 'key' }
      )

    if (error) {
      console.error(`Gagal menyimpan setting [${entry.key}]:`, error)
      return { success: false, error: `Gagal menyimpan ${entry.key}: ${error.message}` }
    }
  }

  revalidatePath('/', 'layout')
  return { success: true, error: null }
}
