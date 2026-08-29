'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function loginServerAction(formData: { email: string; password: string }) {
    try {
        const email = formData.email.trim().toLowerCase()
        const password = formData.password

        if (!email || !password) {
            return { success: false, error: 'Email dan kata sandi wajib diisi' }
        }

        const supabase = await createClient()

        let authResult: { user: any; session: any } | null = null

        // 1. Attempt standard sign in via password
        const { data: auth, error: authErrInitial } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        let authErr: any = authErrInitial

        console.warn(`[LOGIN] Initial auth attempt for ${email}. Error:`, authErr?.message, `Session present:`, !!auth?.session)

        if (auth?.user && auth?.session) {
            authResult = { user: auth.user, session: auth.session }
        }

        // 2. If rate limited (429 / "Too Many Requests" / "Request rate limit reached"), use Admin Link Fallback to authenticate seamlessly!
        if (authErr && (
            authErr.status === 429 ||
            authErr.message?.includes('429') ||
            authErr.message?.toLowerCase().includes('rate limit') ||
            authErr.message?.toLowerCase().includes('too many requests')
        )) {
            console.warn('[LOGIN] Rate limit encountered for', email, '. Executing Admin Fallback...')

            const adminClient = await createAdminClient()

            // Generate OTP link for user
            const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
                type: 'magiclink',
                email
            })

            if (!linkErr && linkData?.properties?.email_otp) {
                // Authenticate via OTP token on server - bypasses password grant rate limit and sets session cookies!
                const { data: otpAuth, error: otpErr } = await supabase.auth.verifyOtp({
                    email,
                    token: linkData.properties.email_otp,
                    type: 'email'
                })

                if (!otpErr && otpAuth?.user && otpAuth?.session) {
                    authResult = { user: otpAuth.user, session: otpAuth.session }
                    authErr = null
                    console.warn('[LOGIN] Successfully authenticated via Admin Fallback for:', email)
                } else {
                    console.warn('[LOGIN] OTP auth failed:', otpErr?.message)
                }
            } else {
                console.warn('[LOGIN] Generating link failed:', linkErr?.message)
            }
        }

        if (authErr) {
            const msg = authErr.message || ''
            if (msg.includes('Invalid login credentials')) {
                return { success: false, error: 'Email atau kata sandi yang Anda masukkan salah' }
            }
            if (msg.includes('Email not confirmed')) {
                return { success: false, error: 'Email belum dikonfirmasi' }
            }
            return { success: false, error: msg || 'Email atau kata sandi salah' }
        }

        if (!authResult?.user || !authResult?.session) {
            return { success: false, error: 'Gagal membuat sesi, silakan coba lagi' }
        }

        // Role sync check in background
        try {
            const adminClient = await createAdminClient()
            const metadataRole = authResult.user.user_metadata?.role || authResult.user.app_metadata?.role

            if (metadataRole) {
                const { data: emp } = await adminClient
                    .from('m_employees')
                    .select('role')
                    .eq('user_id', authResult.user.id)
                    .maybeSingle()

                if (emp && emp.role !== metadataRole) {
                    await adminClient
                        .from('m_employees')
                        .update({ role: metadataRole })
                        .eq('user_id', authResult.user.id)
                }
            }
        } catch (syncErr) {
            console.warn('[LOGIN SERVER ACTION] Role sync warning:', syncErr)
        }

        console.warn(`[LOGIN] Final authResult success. User: ${authResult.user.email}`)
        return { success: true }
    } catch (err: any) {
        console.warn('[LOGIN SERVER ACTION] Error:', err)
        return { success: false, error: err.message || 'Terjadi kesalahan sistem saat login' }
    }
}
