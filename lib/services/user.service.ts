import { createClient } from '@/lib/supabase/client'
import { type Role } from './rbac.service'
import type { UserWithEmployee, CreateUserInput, UpdateUserInput, UserMetadata } from '@/lib/types/database.types'

export interface Employee {
  id: string
  user_id: string | null
  employee_code: string
  full_name: string
  email?: string // Deprecated - will be removed
  unit_id: string
  role?: Role // Deprecated - will be removed
  tax_status?: string
  is_active: boolean
  created_at: string
  updated_at: string
  m_units?: {
    name: string
  }
}

export interface CreateEmployeeData {
  employee_code: string
  full_name: string
  email: string
  unit_id: string
  role: Role
  tax_status?: string
}

export interface UpdateEmployeeData {
  employee_code?: string
  full_name?: string
  email?: string
  unit_id?: string
  role?: Role
  tax_status?: string
  is_active?: boolean
}

/**
 * Generate a random 8-character alphanumeric password
 */
export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let password = ''
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}


/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Get all employees with pagination and search
 * Note: Does not include email/role - use getEmployeesWithAuth server action for that
 */
export async function getEmployees(
  page: number = 1,
  pageSize: number = 50,
  searchTerm: string = ''
): Promise<{ data: Employee[]; count: number; error?: string }> {
  try {
    const supabase = createClient()

    let query = supabase
      .from('m_employees')
      .select('id, user_id, employee_code, full_name, unit_id, tax_status, is_active, created_at, updated_at, m_units(name)', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Apply search filter (only on employee table fields)
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,employee_code.ilike.%${searchTerm}%`)
    }

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return { data: [], count: 0, error: error.message }
    }

    // Transform data to match Employee type
    const transformedData: Employee[] = (data || []).map((item: any) => ({
      id: item.id,
      user_id: item.user_id,
      employee_code: item.employee_code,
      full_name: item.full_name,
      unit_id: item.unit_id,
      tax_status: item.tax_status,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      m_units: Array.isArray(item.m_units) && item.m_units.length > 0
        ? item.m_units[0]
        : undefined
    }))

    return { data: transformedData, count: count || 0 }
  } catch (err: any) {
    return { data: [], count: 0, error: err.message }
  }
}


/**
 * Create a new employee (DEPRECATED - use createUser instead)
 * This function is kept for backward compatibility
 */
export async function createEmployee(
  data: CreateEmployeeData
): Promise<{ success: boolean; error?: string; password?: string }> {
  // Generate temporary password
  const tempPassword = generateTemporaryPassword()

  // Redirect to new createUser function
  return createUser({
    email: data.email,
    password: tempPassword,
    employeeCode: data.employee_code,
    fullName: data.full_name,
    unitId: data.unit_id,
    role: data.role,
    taxStatus: data.tax_status,
  })
}


/**
 * Update an employee (DEPRECATED - use updateUser instead)
 * This function is kept for backward compatibility
 * @param id - employee_id (not user_id)
 */
export async function updateEmployee(
  id: string,
  data: UpdateEmployeeData
): Promise<{ success: boolean; error?: string; sessionTerminated?: boolean }> {
  try {
    const supabase = createClient()

    // Get user_id from employee_id
    const { data: employee } = await supabase
      .from('m_employees')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!employee?.user_id) {
      return { success: false, error: 'Employee not found' }
    }

    // Convert to UpdateUserInput format
    const updates: UpdateUserInput = {}
    if (data.email) updates.email = data.email
    if (data.employee_code) updates.employeeCode = data.employee_code
    if (data.full_name) updates.fullName = data.full_name
    if (data.unit_id) updates.unitId = data.unit_id
    if (data.role) updates.role = data.role
    if (data.tax_status) updates.taxStatus = data.tax_status
    if (data.is_active !== undefined) updates.isActive = data.is_active

    // Use new updateUser function
    const result = await updateUser(employee.user_id, updates)

    return {
      ...result,
      sessionTerminated: !!data.role
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Deactivate an employee
 */
export async function deactivateEmployee(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Update employee record
    const { error: updateError } = await supabase
      .from('m_employees')
      .update({ is_active: false })
      .eq('id', id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Delete an employee
 */
export async function deleteEmployee(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Delete employee record
    const { error: deleteError } = await supabase
      .from('m_employees')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}


// ============================================
// NEW USER SERVICE METHODS (Auth-based)
// ============================================

/**
 * Create a new user with both auth.users and m_employees records
 * This is a transactional operation - both must succeed or both fail
 */
export async function createUser(
  input: CreateUserInput
): Promise<{ success: boolean; user?: UserWithEmployee; error?: string; password?: string }> {
  try {
    const supabase = createClient()

    // Validate email format
    if (!validateEmail(input.email)) {
      return { success: false, error: 'Invalid email format' }
    }

    // Check if employee code already exists
    const { data: existingCode } = await supabase
      .from('m_employees')
      .select('id')
      .eq('employee_code', input.employeeCode)
      .single()

    if (existingCode) {
      return { success: false, error: 'Employee code already exists' }
    }

    // Generate temporary password
    const tempPassword = input.password || generateTemporaryPassword()

    // Step 1: Create auth.users record with metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: input.email,
      password: tempPassword,
      options: {
        data: {
          role: input.role,
          full_name: input.fullName,
          unit_id: input.unitId,
        } as UserMetadata
      }
    })

    if (authError) {
      return { success: false, error: authError.message }
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create auth user' }
    }

    // Step 2: Create m_employees record linked to auth user
    const { data: employeeData, error: employeeError } = await supabase
      .from('m_employees')
      .insert({
        user_id: authData.user.id,
        employee_code: input.employeeCode,
        full_name: input.fullName,
        unit_id: input.unitId,
        tax_status: input.taxStatus || 'TK/0',
        is_active: true,
      })
      .select()
      .single()

    if (employeeError) {
      // Rollback: delete auth user if employee creation fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      return { success: false, error: employeeError.message }
    }

    // Construct UserWithEmployee response
    const user: UserWithEmployee = {
      id: authData.user.id,
      email: authData.user.email!,
      role: input.role,
      employeeId: employeeData.id,
      employeeCode: employeeData.employee_code,
      fullName: employeeData.full_name,
      unitId: employeeData.unit_id,
      taxStatus: employeeData.tax_status,
      isActive: employeeData.is_active,
      createdAt: employeeData.created_at,
      updatedAt: employeeData.updated_at,
    }

    return { success: true, user, password: tempPassword }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Get user by ID (joins auth.users with m_employees)
 */
export async function getUserById(
  userId: string
): Promise<{ user: UserWithEmployee | null; error?: string }> {
  try {
    const supabase = createClient()

    // Get employee record by user_id
    const { data: employee, error: employeeError } = await supabase
      .from('m_employees')
      .select('id, user_id, employee_code, full_name, unit_id, tax_status, is_active, created_at, updated_at')
      .eq('user_id', userId)
      .single()

    if (employeeError || !employee) {
      return { user: null, error: employeeError?.message || 'Employee not found' }
    }

    // Get auth user data
    const { data: { user: authUser }, error: authError } = await supabase.auth.admin.getUserById(userId)

    if (authError || !authUser) {
      return { user: null, error: authError?.message || 'Auth user not found' }
    }

    const metadata = authUser.user_metadata as UserMetadata

    const user: UserWithEmployee = {
      id: authUser.id,
      email: authUser.email!,
      role: metadata.role,
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      fullName: employee.full_name,
      unitId: employee.unit_id,
      taxStatus: employee.tax_status,
      isActive: employee.is_active,
      createdAt: employee.created_at,
      updatedAt: employee.updated_at,
    }

    return { user }
  } catch (err: any) {
    return { user: null, error: err.message }
  }
}

/**
 * Get user by email (queries auth.users then joins with m_employees)
 */
export async function getUserByEmail(
  email: string
): Promise<{ user: UserWithEmployee | null; error?: string }> {
  try {
    const supabase = createClient()

    // Search for auth user by email
    const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers()

    if (searchError) {
      return { user: null, error: searchError.message }
    }

    const authUser = users.find(u => u.email === email)

    if (!authUser) {
      return { user: null, error: 'User not found' }
    }

    // Get employee record
    return getUserById(authUser.id)
  } catch (err: any) {
    return { user: null, error: err.message }
  }
}

/**
 * Update user (updates appropriate tables based on field type)
 */
export async function updateUser(
  userId: string,
  updates: UpdateUserInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Validate email if being updated
    if (updates.email && !validateEmail(updates.email)) {
      return { success: false, error: 'Invalid email format' }
    }

    // Separate auth updates from employee updates
    const authUpdates: any = {}
    const employeeUpdates: any = {}

    if (updates.email) authUpdates.email = updates.email
    if (updates.password) authUpdates.password = updates.password

    if (updates.role || updates.fullName || updates.unitId) {
      authUpdates.user_metadata = {}
      if (updates.role) authUpdates.user_metadata.role = updates.role
      if (updates.fullName) authUpdates.user_metadata.full_name = updates.fullName
      if (updates.unitId) authUpdates.user_metadata.unit_id = updates.unitId
    }

    if (updates.employeeCode) employeeUpdates.employee_code = updates.employeeCode
    if (updates.fullName) employeeUpdates.full_name = updates.fullName
    if (updates.unitId) employeeUpdates.unit_id = updates.unitId
    if (updates.taxStatus) employeeUpdates.tax_status = updates.taxStatus
    if (updates.isActive !== undefined) employeeUpdates.is_active = updates.isActive

    // Update auth.users if needed
    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        userId,
        authUpdates
      )

      if (authError) {
        return { success: false, error: authError.message }
      }
    }

    // Update m_employees if needed
    if (Object.keys(employeeUpdates).length > 0) {
      const { error: employeeError } = await supabase
        .from('m_employees')
        .update(employeeUpdates)
        .eq('user_id', userId)

      if (employeeError) {
        return { success: false, error: employeeError.message }
      }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Deactivate a user (sets is_active flag and optionally disables auth)
 */
export async function deactivateUser(
  userId: string,
  disableAuth: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()

    // Update employee record
    const { error: employeeError } = await supabase
      .from('m_employees')
      .update({ is_active: false })
      .eq('user_id', userId)

    if (employeeError) {
      return { success: false, error: employeeError.message }
    }

    // Optionally disable auth
    if (disableAuth) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        userId,
        { ban_duration: '876000h' } // Ban for 100 years
      )

      if (authError) {
        return { success: false, error: authError.message }
      }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * List all users with optional filters (joins auth.users with m_employees)
 */
export async function listUsers(
  filters?: {
    role?: Role
    unitId?: string
    isActive?: boolean
    searchTerm?: string
  }
): Promise<{ users: UserWithEmployee[]; error?: string }> {
  try {
    const supabase = createClient()

    // Build employee query
    let query = supabase
      .from('m_employees')
      .select('id, user_id, employee_code, full_name, unit_id, tax_status, is_active, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (filters?.unitId) {
      query = query.eq('unit_id', filters.unitId)
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    if (filters?.searchTerm) {
      query = query.or(`full_name.ilike.%${filters.searchTerm}%,employee_code.ilike.%${filters.searchTerm}%`)
    }

    const { data: employees, error: employeeError } = await query

    if (employeeError) {
      return { users: [], error: employeeError.message }
    }

    if (!employees || employees.length === 0) {
      return { users: [] }
    }

    // Get all auth users
    const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers()

    if (authError) {
      return { users: [], error: authError.message }
    }

    // Join data
    const rawUsers: (UserWithEmployee | null)[] = employees
      .map(emp => {
        const authUser = authUsers.find(u => u.id === emp.user_id)
        if (!authUser) return null

        const metadata = (authUser.user_metadata || {}) as UserMetadata

        // Apply role filter
        if (filters?.role && metadata.role !== filters.role) {
          return null
        }

        return {
          id: authUser.id,
          email: authUser.email!,
          role: metadata.role,
          employeeId: emp.id,
          employeeCode: emp.employee_code,
          fullName: emp.full_name,
          unitId: emp.unit_id,
          taxStatus: emp.tax_status,
          isActive: emp.is_active,
          createdAt: emp.created_at,
          updatedAt: emp.updated_at,
        }
      })

    const users: UserWithEmployee[] = rawUsers.filter((u): u is UserWithEmployee => u !== null)

    return { users }
  } catch (err: any) {
    return { users: [], error: err.message }
  }
}
