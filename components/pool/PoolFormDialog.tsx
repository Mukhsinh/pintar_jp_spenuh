'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { createPoolAction } from '@/app/(authenticated)/pool/actions'

interface PoolFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function PoolFormDialog({
  open,
  onOpenChange,
  onSuccess
}: PoolFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    period: '',
    global_allocation_percentage: '100.00'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      // Set default period to current month
      const now = new Date()
      const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setFormData({
        period: defaultPeriod,
        global_allocation_percentage: '100.00'
      })
      setErrors({})
    }
  }, [open])

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {}

    // Validate period format (YYYY-MM)
    const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/
    if (!formData.period) {
      newErrors.period = 'Periode wajib diisi'
    } else if (!periodRegex.test(formData.period)) {
      newErrors.period = 'Periode harus dalam format YYYY-MM'
    }

    // Validate allocation percentage
    if (!formData.global_allocation_percentage) {
      newErrors.global_allocation_percentage = 'Persentase alokasi wajib diisi'
    } else {
      const percentage = parseFloat(formData.global_allocation_percentage)
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        newErrors.global_allocation_percentage = 'Persentase alokasi harus antara 0 dan 100'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      const res = await createPoolAction({
        period: formData.period,
        global_allocation_percentage: parseFloat(formData.global_allocation_percentage)
      })

      if (!res.success) {
        if (res.error?.includes('sudah ada')) {
          setErrors({ period: res.error })
        } else {
          alert(res.error || 'Gagal membuat pool')
        }
        return
      }

      alert('Pool berhasil dibuat!')
      onSuccess()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error creating pool:', error)
      alert(error.message || 'Gagal membuat pool')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Buat Pool Baru</DialogTitle>
            <DialogDescription>
              Buat pool keuangan baru untuk periode tertentu
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Period */}
            <div className="space-y-2">
              <Label htmlFor="period">Periode (YYYY-MM) *</Label>
              <Input
                id="period"
                type="month"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                placeholder="2024-01"
              />
              {errors.period && (
                <p className="text-sm text-red-600">{errors.period}</p>
              )}
              <p className="text-xs text-gray-500">
                Pilih bulan dan tahun untuk pool ini
              </p>
            </div>

            {/* Global Allocation Percentage */}
            <div className="space-y-2">
              <Label htmlFor="global_allocation_percentage">Persentase Alokasi Global (%) *</Label>
              <Input
                id="global_allocation_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.global_allocation_percentage}
                onChange={(e) => setFormData({ ...formData, global_allocation_percentage: e.target.value })}
                placeholder="100.00"
              />
              {errors.global_allocation_percentage && (
                <p className="text-sm text-red-600">{errors.global_allocation_percentage}</p>
              )}
              <p className="text-xs text-gray-500">
                Persentase pool bersih yang dialokasikan (default: 100%)
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                Setelah membuat pool, Anda dapat menambahkan item pendapatan dan potongan di detail pool.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Membuat...' : 'Buat Pool'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
