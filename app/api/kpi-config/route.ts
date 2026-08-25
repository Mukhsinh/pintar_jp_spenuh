import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get employee profile using user_id to check role
    const { data: employee, error: employeeError } = await supabase
      .from('m_employees')
      .select('role, full_name, employee_code')
      .eq('user_id', user.id)
      .single()

    if (employeeError || !employee) {
      console.error('Employee profile error:', employeeError)
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
    }

    // Superadmin and unit_manager can access KPI config
    if (employee.role !== 'superadmin' && employee.role !== 'unit_manager') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      message: 'KPI Config API is working',
      user: {
        name: employee.full_name,
        code: employee.employee_code,
        role: employee.role
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('KPI Config API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
