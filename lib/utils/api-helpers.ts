/**
 * API helper utilities for consistent request/response handling
 * Optimizes API routes with caching, validation, and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError } from './error-handler'

export interface ApiOptions {
  requireAuth?: boolean
  allowedRoles?: string[]
  cache?: number // Cache duration in seconds
}

export function withApiHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  options: ApiOptions = {}
) {
  return async (req: NextRequest, context?: any) => {
    try {
      const { requireAuth = true, allowedRoles, cache } = options

      // Add cache headers if specified
      if (cache && req.method === 'GET') {
        const response = await handler(req, context)
        response.headers.set('Cache-Control', `public, max-age=${cache}, s-maxage=${cache}`)
        return response
      }

      // Auth validation
      if (requireAuth) {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        }

        // Role validation
        if (allowedRoles) {
          const { data: employee } = await supabase
            .from('m_employees')
            .select('role')
            .eq('user_id', user.id)
            .single()

          if (!employee || !allowedRoles.includes(employee.role)) {
            return NextResponse.json(
              { error: 'Forbidden' },
              { status: 403 }
            )
          }
        }
      }

      return await handler(req, context)
    } catch (error) {
      return handleApiError(error)
    }
  }
}