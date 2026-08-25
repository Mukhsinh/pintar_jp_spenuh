'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Save, Image as ImageIcon, AlertCircle, FileDown, BookOpen, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { saveSettings } from './actions'

interface Settings {
  app_name: string
  developer_name: string
  organization_name: string
  organization_address: string
  organization_phone: string
  organization_email: string
  logo_url: string | null
  footer_text: string
  tax_rates: {
    'TK/0': number
    'TK/1': number
    'TK/2': number
    'TK/3': number
    'K/0': number
    'K/1': number
    'K/2': number
    'K/3': number
  }
  ter_rates: {
    categoryA: number
    categoryB: number
    categoryC: number
  }
  calculation_params: {
    minScore: number
    maxScore: number
  }
  session_timeout: {
    hours: number
  }
  tax_config: {
    mechanism: 'none' | 'ter' | 'final_pp80'
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    app_name: 'JASPEL',
    developer_name: '',
    organization_name: '',
    organization_address: '',
    organization_phone: '',
    organization_email: '',
    logo_url: null,
    footer_text: '',
    tax_rates: {
      'TK/0': 5,
      'TK/1': 5,
      'TK/2': 15,
      'TK/3': 15,
      'K/0': 5,
      'K/1': 15,
      'K/2': 25,
      'K/3': 30
    },
    ter_rates: {
      categoryA: 0,
      categoryB: 0,
      categoryC: 0
    },
    calculation_params: {
      minScore: 0,
      maxScore: 100
    },
    session_timeout: {
      hours: 8
    },
    tax_config: {
      mechanism: 'ter'
    }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('t_settings')
        .select('key, value')

      if (error) {
        console.error('Error loading settings:', error)
        throw error
      }

      const settingsMap: any = {}
      data?.forEach(item => {
        settingsMap[item.key] = item.value
      })

      // Extract company info
      const orgSettings = settingsMap.company_info || {}
      const footerSettings = settingsMap.footer || {}
      const taxRates = settingsMap.tax_rates || {}
      const terRates = settingsMap.ter_rates || {}
      const calcParams = settingsMap.calculation_params || {}
      const sessionTimeout = settingsMap.session_timeout || {}
      const taxConfig = settingsMap.tax_config || { mechanism: 'ter' }

      setSettings({
        app_name: orgSettings.appName || 'JASPEL',
        developer_name: orgSettings.developerName || '',
        organization_name: orgSettings.name || '',
        organization_address: orgSettings.address || '',
        organization_phone: orgSettings.phone || '',
        organization_email: orgSettings.email || '',
        logo_url: orgSettings.logo || null,
        footer_text: typeof footerSettings === 'string' ? footerSettings : (footerSettings.text || ''),
        tax_rates: {
          'TK/0': taxRates['TK0'] || taxRates['TK/0'] || 5,
          'TK/1': taxRates['TK1'] || taxRates['TK/1'] || 5,
          'TK/2': taxRates['TK2'] || taxRates['TK/2'] || 15,
          'TK/3': taxRates['TK3'] || taxRates['TK/3'] || 15,
          'K/0': taxRates['K0'] || taxRates['K/0'] || 5,
          'K/1': taxRates['K1'] || taxRates['K/1'] || 15,
          'K/2': taxRates['K2'] || taxRates['K/2'] || 25,
          'K/3': taxRates['K3'] || taxRates['K/3'] || 30
        },
        ter_rates: {
          categoryA: terRates.categoryA ?? 0,
          categoryB: terRates.categoryB ?? 0,
          categoryC: terRates.categoryC ?? 0
        },
        calculation_params: {
          minScore: calcParams.minScore ?? 0,
          maxScore: calcParams.maxScore ?? 100
        },
        session_timeout: {
          hours: sessionTimeout.hours ?? 8
        },
        tax_config: {
          mechanism: taxConfig.mechanism || 'ter'
        }
      })

      if (orgSettings.logo) {
        setLogoPreview(orgSettings.logo)
      }
    } catch (error: any) {
      console.error('Error loading settings:', error)
      toast.error('Gagal memuat pengaturan: ' + (error.message || 'Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Ukuran file maksimal 2MB')
        return
      }

      if (!file.type.startsWith('image/')) {
        toast.error('File harus berupa gambar')
        return
      }

      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return settings.logo_url

    try {
      const supabase = createClient()
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `logo-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.warn('Supabase storage upload error, using Data URL fallback:', uploadError)
        return logoPreview || settings.logo_url
      }

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName)

      return publicUrl
    } catch (error: any) {
      console.warn('Error uploading logo, using Data URL fallback:', error)
      return logoPreview || settings.logo_url
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      let logoUrl = settings.logo_url

      if (logoFile) {
        const uploadedUrl = await uploadLogo()
        if (uploadedUrl) {
          logoUrl = uploadedUrl
        } else {
          setIsSaving(false)
          return
        }
      }

      const result = await saveSettings({
        company_info: {
          appName: settings.app_name,
          developerName: settings.developer_name,
          name: settings.organization_name,
          address: settings.organization_address,
          phone: settings.organization_phone,
          email: settings.organization_email,
          logo: logoUrl || '',
        },
        footer: { text: settings.footer_text },
        tax_rates: {
          TK0: settings.tax_rates['TK/0'],
          TK1: settings.tax_rates['TK/1'],
          TK2: settings.tax_rates['TK/2'],
          TK3: settings.tax_rates['TK/3'],
          K0: settings.tax_rates['K/0'],
          K1: settings.tax_rates['K/1'],
          K2: settings.tax_rates['K/2'],
          K3: settings.tax_rates['K/3'],
        },
        ter_rates: settings.ter_rates,
        calculation_params: settings.calculation_params,
        session_timeout: settings.session_timeout,
        tax_config: settings.tax_config,
      })

      if (!result.success) {
        throw new Error(result.error || 'Gagal menyimpan')
      }

      toast.success('Pengaturan berhasil disimpan')
      setLogoFile(null)

      // Clear sidebar cache and trigger refresh
      try { localStorage.removeItem('sidebar-company-info') } catch { }
      window.dispatchEvent(new Event('sidebar-refresh'))

      await loadSettings()
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(`Gagal menyimpan pengaturan: ${error.message || 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadOverview = async () => {
    try {
      toast.loading('Sedang menyiapkan laporan overview...')
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'system-overview',
          period: new Date().getFullYear().toString(),
          format: 'pdf',
          data: {}
        }),
      })
      if (!response.ok) throw new Error('Gagal mengunduh laporan')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `Overview_Aplikasi_PINTAR_JP.pdf`,
      })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.dismiss()
      toast.success('Laporan overview berhasil diunduh')
    } catch (err: any) {
      toast.dismiss()
      toast.error('Gagal mengunduh laporan: ' + err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pengaturan Sistem</h1>
        <p className="text-gray-600 mt-1">Kelola informasi organisasi dan pengaturan aplikasi</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Organisasi</CardTitle>
            <CardDescription>Data aplikasi dan organisasi yang akan ditampilkan di laporan dan aplikasi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app_name">Nama Aplikasi</Label>
              <Input
                id="app_name"
                value={settings.app_name}
                onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                placeholder="Masukkan nama aplikasi"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="developer_name">Nama Pengembang</Label>
              <Input
                id="developer_name"
                value={settings.developer_name}
                onChange={(e) => setSettings({ ...settings, developer_name: e.target.value })}
                placeholder="Masukkan nama pengembang"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization_name">Nama Organisasi</Label>
              <Input
                id="organization_name"
                value={settings.organization_name}
                onChange={(e) => setSettings({ ...settings, organization_name: e.target.value })}
                placeholder="Masukkan nama organisasi"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization_address">Alamat</Label>
              <Textarea
                id="organization_address"
                value={settings.organization_address}
                onChange={(e) => setSettings({ ...settings, organization_address: e.target.value })}
                placeholder="Masukkan alamat lengkap"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization_phone">Telepon</Label>
              <Input
                id="organization_phone"
                value={settings.organization_phone}
                onChange={(e) => setSettings({ ...settings, organization_phone: e.target.value })}
                placeholder="Masukkan nomor telepon"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization_email">Email</Label>
              <Input
                id="organization_email"
                type="email"
                value={settings.organization_email}
                onChange={(e) => setSettings({ ...settings, organization_email: e.target.value })}
                placeholder="Masukkan email"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo Organisasi</CardTitle>
            <CardDescription>Upload logo yang akan ditampilkan di aplikasi (Maks. 2MB)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Logo Saat Ini</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo Preview"
                    className="max-h-32 mx-auto object-contain"
                  />
                ) : (
                  <div className="text-gray-400">
                    <ImageIcon className="h-16 w-16 mx-auto mb-2" />
                    <p>Belum ada logo</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">Upload Logo Baru</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => document.getElementById('logo')?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-gray-500">Format: JPG, PNG, SVG (Maks. 2MB)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teks Footer</CardTitle>
          <CardDescription>Teks yang akan ditampilkan di bagian bawah aplikasi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="footer_text">Footer</Label>
            <Textarea
              id="footer_text"
              value={settings.footer_text}
              onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
              placeholder="Masukkan teks footer"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>
            Pilih pola perhitungan pajak yang akan digunakan pada periode laporan berjalan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 mb-6">
            <Label htmlFor="tax_mechanism" className="text-base font-bold text-blue-800">Mekanisme Pajak Global</Label>
            <select
              id="tax_mechanism"
              value={settings.tax_config.mechanism}
              onChange={(e) => setSettings({
                ...settings,
                tax_config: { mechanism: e.target.value as any }
              })}
              className="w-full px-3 py-2 border-2 border-blue-200 rounded-md bg-blue-50 focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="none">1. Tanpa Potongan Pajak (Bruto Only)</option>
              <option value="ter">2. Mekanisme TER (PP 58/2023)</option>
              <option value="final_pp80">3. Mekanisme Final (PP 80/2010)</option>
            </select>
            <p className="text-sm text-blue-600 italic">
              {settings.tax_config.mechanism === 'none' && "* Laporan hanya menampilkan nilai Bruto. Keterangan 'Sebelum Pajak' akan ditambahkan."}
              {settings.tax_config.mechanism === 'ter' && "* Menggunakan tabel TER Januari-November dan Pasal 17 pada bulan Desember."}
              {settings.tax_config.mechanism === 'final_pp80' && "* Final PNS: Gol IV (15%), Gol III (5%), Gol II/Bawah & Non-PNS (0%)."}
            </p>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Perhitungan Otomatis</AlertTitle>
            <AlertDescription className="text-sm">
              Sistem JASPEL menghitung PPh 21 secara otomatis berdasarkan tabel resmi Lampiran PP 58/2023. Tidak perlu input manual.
            </AlertDescription>
          </Alert>

          {/* TER Section: Januari - November */}
          <div>
            <h4 className="font-semibold text-sm mb-3">📅 Masa Pajak Januari — November (TER Bulanan)</h4>
            <p className="text-xs text-gray-600 mb-4">
              PPh 21 = Penghasilan Bruto Bulanan × Tarif Efektif (sesuai kategori PTKP)
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4 bg-blue-50/30">
                <h5 className="font-semibold text-blue-800 mb-1 text-sm">Kategori A</h5>
                <p className="text-xs text-blue-700/80 mb-2">PTKP: TK/0, TK/1, K/0</p>
                <div className="text-xs space-y-0.5 text-gray-600">
                  <p>• s.d. 5.4jt: 0%</p>
                  <p>• 5.4jt - 5.65jt: 0.25%</p>
                  <p>• ... (44 lapisan tarif)</p>
                  <p>• &gt; 1.419jt: 34%</p>
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-green-50/30">
                <h5 className="font-semibold text-green-800 mb-1 text-sm">Kategori B</h5>
                <p className="text-xs text-green-700/80 mb-2">PTKP: TK/2, TK/3, K/1, K/2</p>
                <div className="text-xs space-y-0.5 text-gray-600">
                  <p>• s.d. 6.2jt: 0%</p>
                  <p>• 6.2jt - 6.5jt: 0.25%</p>
                  <p>• ... (40 lapisan tarif)</p>
                  <p>• &gt; 1.405jt: 34%</p>
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-orange-50/30">
                <h5 className="font-semibold text-orange-800 mb-1 text-sm">Kategori C</h5>
                <p className="text-xs text-orange-700/80 mb-2">PTKP: K/3</p>
                <div className="text-xs space-y-0.5 text-gray-600">
                  <p>• s.d. 6.6jt: 0%</p>
                  <p>• 6.6jt - 6.95jt: 0.25%</p>
                  <p>• ... (41 lapisan tarif)</p>
                  <p>• &gt; 1.419jt: 34%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Progressive Section: Desember */}
          <div>
            <h4 className="font-semibold text-sm mb-3">📅 Masa Pajak Desember (Tarif Pasal 17)</h4>
            <p className="text-xs text-gray-600 mb-4">
              Perhitungan ulang menggunakan tarif progresif Pasal 17 ayat (1) huruf a UU PPh atas PKP setahun.
            </p>
            <div className="rounded-lg border p-4 bg-gray-50/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 font-semibold">Lapisan Penghasilan Kena Pajak</th>
                    <th className="text-right py-1 font-semibold">Tarif</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-dashed"><td className="py-1">s.d. Rp 60.000.000</td><td className="text-right">5%</td></tr>
                  <tr className="border-b border-dashed"><td className="py-1">Rp 60.000.000 — Rp 250.000.000</td><td className="text-right">15%</td></tr>
                  <tr className="border-b border-dashed"><td className="py-1">Rp 250.000.000 — Rp 500.000.000</td><td className="text-right">25%</td></tr>
                  <tr className="border-b border-dashed"><td className="py-1">Rp 500.000.000 — Rp 5.000.000.000</td><td className="text-right">30%</td></tr>
                  <tr><td className="py-1">Di atas Rp 5.000.000.000</td><td className="text-right">35%</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs text-gray-500 italic">
            * Sumber: PP Nomor 58 Tahun 2023 & UU HPP Pasal 17 ayat (1) huruf a. Tabel lengkap tersedia di file Tarif TER.pdf.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">

        <Card>
          <CardHeader>
            <CardTitle>Parameter Perhitungan</CardTitle>
            <CardDescription>Konfigurasi parameter untuk perhitungan KPI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="min_score">Skor Minimum</Label>
              <Input
                id="min_score"
                type="number"
                min="0"
                value={settings.calculation_params.minScore}
                onChange={(e) => setSettings({
                  ...settings,
                  calculation_params: {
                    ...settings.calculation_params,
                    minScore: parseFloat(e.target.value) || 0
                  }
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_score">Skor Maksimum</Label>
              <Input
                id="max_score"
                type="number"
                min="0"
                value={settings.calculation_params.maxScore}
                onChange={(e) => setSettings({
                  ...settings,
                  calculation_params: {
                    ...settings.calculation_params,
                    maxScore: parseFloat(e.target.value) || 0
                  }
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session_timeout">Timeout Sesi (Jam)</Label>
              <Input
                id="session_timeout"
                type="number"
                min="1"
                max="24"
                value={settings.session_timeout.hours}
                onChange={(e) => setSettings({
                  ...settings,
                  session_timeout: {
                    hours: parseInt(e.target.value) || 8
                  }
                })}
              />
              <p className="text-sm text-gray-500">Durasi sesi login sebelum otomatis logout (1-24 jam)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <CardTitle>Dokumentasi & Ringkasan Aplikasi</CardTitle>
          </div>
          <CardDescription>
            Unduh laporan lengkap mengenai gambaran umum aplikasi, fitur utama, dan panduan penggunaan sistem PINTAR JP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border rounded-lg bg-white">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="font-semibold text-sm">Laporan Gambaran Umum & Manual</p>
                <p className="text-xs text-gray-500">Format PDF • Lengkap dengan Cover & Sistematika Profesional</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 w-full md:w-auto"
              onClick={handleDownloadOverview}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Unduh Laporan PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </Button>
      </div>
    </div>
  )
}
