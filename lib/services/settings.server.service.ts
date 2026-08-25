import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from './audit.service'
import type { Settings } from './settings.service'

// Helper function to transform settings array to object
function transformSettingsData(data: any[]): Settings {
  const settings: any = {}
  data?.forEach((item) => {
    if (item.key === 'company_info') {
      settings.companyInfo = item.value
    } else if (item.key === 'footer') {
      settings.footer = item.value
    } else if (item.key === 'tax_rates') {
      settings.taxRates = item.value
    } else if (item.key === 'calculation_params') {
      settings.calculationParams = item.value
    } else if (item.key === 'session_timeout') {
      settings.sessionTimeout = item.value
    } else if (item.key === 'email_templates') {
      settings.emailTemplates = item.value
    }
  })
  return settings as Settings
}

// Server-side functions (use admin client for reliable settings retrieval)
export async function getSettingsServer(): Promise<{ data: Settings | null; error: string | null }> {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('t_settings')
      .select('key, value')

    if (error) {
      console.error('Failed to fetch settings:', error)
      return { data: null, error: error.message }
    }

    return { data: transformSettingsData(data), error: null }
  } catch (err: any) {
    console.error('Error in getSettingsServer:', err)
    return { data: null, error: err.message }
  }
}

export async function getSettingServer(key: string): Promise<{ data: any | null; error: string | null }> {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('t_settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error) {
      console.error(`Failed to fetch setting ${key}:`, error)
      return { data: null, error: error.message }
    }

    return { data: data?.value, error: null }
  } catch (err: any) {
    console.error(`Error in getSettingServer for ${key}:`, err)
    return { data: null, error: err.message }
  }
}

export async function updateSettingServer(
  key: string,
  value: any,
  description?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get old value for audit log
  const { data: oldData } = await supabase
    .from('t_settings')
    .select('value')
    .eq('key', key)
    .single()

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('t_settings')
    .update({
      value,
      description,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    })
    .eq('key', key)

  if (error) {
    console.error(`Failed to update setting ${key}:`, error)
    return { success: false, error: error.message }
  }

  // Log to audit trail - pass supabase client
  await logAudit({
    table_name: 't_settings',
    operation: 'UPDATE',
    record_id: key,
    old_value: oldData?.value,
    new_value: value,
    details: `Updated setting: ${key}`,
  }, supabase)

  return { success: true, error: null }
}

export async function getTaxRateServer(taxStatus: string): Promise<number> {
  const { data } = await getSettingServer('tax_rates')
  return data?.[taxStatus] || 0
}

export async function getSessionTimeoutServer(): Promise<number> {
  const { data } = await getSettingServer('session_timeout')
  return data?.hours || 8
}

export async function getCompanyInfoServer(): Promise<any> {
  const { data } = await getSettingServer('company_info')
  return {
    appName: data?.appName || 'PINTAR JP',
    developerName: data?.developerName || '',
    name: data?.name || '',
    address: data?.address || '',
    phone: data?.phone || '',
    email: data?.email || '',
    logo: data?.logo || '',
    footer: data?.footer || ''
  }
}

export async function getFooterServer(): Promise<string> {
  const { data } = await getSettingServer('footer')
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (data?.text && typeof data.text === 'string' && data.text.trim()) return data.text.trim()
  return ''
}
