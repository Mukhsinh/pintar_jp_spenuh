import { createClient } from '@/lib/supabase/client'

export interface AuditLogEntry {
  table_name: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ACCESS'
  record_id?: string
  ip_address?: string
  old_value?: any
  new_value?: any
  details?: string
}

export interface AuditLogFilter {
  startDate?: string
  endDate?: string
  user?: string
  table?: string
  operation?: string
}

// Helper to get supabase client, works on both client and server
function getSupabaseClient(supabaseClient?: any) {
  if (supabaseClient) return supabaseClient
  // Fallback to browser client (only works on client side)
  return createClient()
}

export async function logAudit(entry: AuditLogEntry, supabaseClient?: any) {
  const supabase = getSupabaseClient(supabaseClient)

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('t_audit_log')
    .insert({
      user_id: user?.id,
      user_name: user?.user_metadata?.full_name || user?.email || 'Unknown User',
      ...entry,
    })

  if (error) {
    console.error('Failed to log audit:', error)
  }
}

export async function logAuth(
  action: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN',
  userId?: string,
  ipAddress?: string,
  success: boolean = true,
  errorMessage?: string,
  supabaseClient?: any
) {
  const supabase = getSupabaseClient(supabaseClient)

  const { error } = await supabase
    .from('t_auth_log')
    .insert({
      user_id: userId,
      action,
      ip_address: ipAddress,
      success,
      error_message: errorMessage,
    })

  if (error) {
    console.error('Failed to log auth:', error)
  }
}

function buildAuditQuery(supabase: any, filters: AuditLogFilter) {
  let query = supabase
    .from('v_audit_log_with_user')
    .select('*', { count: 'exact' })

  if (filters.startDate) {
    query = query.gte('timestamp', filters.startDate)
  }

  if (filters.endDate) {
    query = query.lte('timestamp', filters.endDate + 'T23:59:59.999Z')
  }

  if (filters.user) {
    query = query.or(`user_name.ilike.%${filters.user}%,employee_name.ilike.%${filters.user}%,user_email.ilike.%${filters.user}%`)
  }

  if (filters.table) {
    query = query.eq('table_name', filters.table)
  }

  if (filters.operation) {
    query = query.eq('operation', filters.operation)
  }

  return query
}

export async function getAuditLogs(filters: AuditLogFilter, page: number = 1, pageSize: number = 50, supabaseClient?: any) {
  const supabase = getSupabaseClient(supabaseClient)

  let query = buildAuditQuery(supabase, filters)
    .order('timestamp', { ascending: false })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await query.range(from, to)

  if (error) {
    console.error('Failed to fetch audit logs:', error)
    return { data: [], count: 0, error: error.message }
  }

  return { data: data || [], count: count || 0, error: null }
}

export async function exportAuditLogs(filters: AuditLogFilter, supabaseClient?: any) {
  const supabase = getSupabaseClient(supabaseClient)

  let query = buildAuditQuery(supabase, filters)
    .order('timestamp', { ascending: false })

  const { data, error } = await query

  if (error) {
    console.error('Failed to export audit logs:', error)
    return { data: [], error: error.message }
  }

  return { data: data || [], error: null }
}

export async function logSensitiveDataAccess(tableName: string, recordId: string, supabaseClient?: any) {
  await logAudit({
    table_name: tableName,
    operation: 'ACCESS',
    record_id: recordId,
    details: `Accessed sensitive data in ${tableName}`,
  }, supabaseClient)
}
