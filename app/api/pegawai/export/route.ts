import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { addKopSurat, addPdfFooters } from '@/lib/export/pdf-export'
import { getCompanyInfoServer, getFooterServer } from '@/lib/services/settings.server.service'

// Add type for jsPDF with autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'excel'

    // Use admin client to bypass RLS and get ALL employees for the report
    const adminClient = await createAdminClient()
    const { data: pegawai, error } = await adminClient
      .from('m_employees')
      .select(`
        *,
        m_units (
          code,
          name
        )
      `)
      .order('employee_code', { ascending: true })

    if (error) throw error

    const companyInfo = await getCompanyInfoServer()
    const footerText = await getFooterServer()

    const reportDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    if (format === 'pdf') {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      }) as jsPDFWithAutoTable

      // Dynamic KOP Surat from settings
      await addKopSurat(doc, companyInfo)

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 58, 138)
      doc.text('LAPORAN DATA PEGAWAI', 148.5, 38, { align: 'center' })

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text(`Tanggal Cetak: ${reportDate}`, 15, 45)

      // Table Data
      const tableRows = (pegawai || []).map((p, index) => [
        index + 1,
        p.employee_code,
        p.full_name,
        p.m_units?.name || '-',
        p.position || '-',
        p.employment_status || '-',
        p.tax_status || '-',
        p.is_active ? 'Aktif' : 'Non-Aktif'
      ])

      doc.autoTable({
        startY: 49,
        head: [['No', 'NIP/Kode', 'Nama Lengkap', 'Unit Kerja', 'Jabatan', 'Status', 'Pajak', 'Status Akun']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 30 },
          2: { cellWidth: 60 },
          3: { cellWidth: 50 },
          4: { cellWidth: 40 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
          7: { cellWidth: 25, halign: 'center' }
        }
      })

      // Signature area on final page
      const finalY = (doc as any).lastAutoTable.finalY + 12
      if (finalY < 170) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0)
        doc.text('Sungai Bahar, ' + reportDate, 230, finalY)
        doc.text('Admin Sistem,', 230, finalY + 6)
        doc.text('( ____________________ )', 230, finalY + 28)
      }

      await addPdfFooters(doc, footerText)

      const pdfOutput = doc.output('arraybuffer')

      return new NextResponse(pdfOutput, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Laporan_Pegawai_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      })
    } else {
      // Generate Excel with formal Kop Surat from settings
      const { buildExcelKopHeader } = await import('@/lib/export/excel-export')
      const kopSurat = buildExcelKopHeader(companyInfo, 'LAPORAN DATA PEGAWAI', `Tanggal Cetak: ${reportDate}`)

      const worksheetData = [
        ...kopSurat,
        ['No', 'Kode Pegawai', 'NIK', 'Nama Lengkap', 'Unit', 'Jabatan', 'Status Kerja', 'Status Pajak', 'Bank', 'No. Rekening', 'Status Akun']
      ]

      const employeeData = (pegawai || []).map((p, index) => [
        index + 1,
        p.employee_code,
        p.nik || '',
        p.full_name,
        p.m_units?.name || '',
        p.position || '',
        p.employment_status || '',
        p.tax_status || '',
        p.bank_name || '',
        p.bank_account_number || '',
        p.is_active ? 'Aktif' : 'Nonaktif'
      ])

      const finalData = [...worksheetData, ...employeeData, [], [footerText], [`Dicetak: ${new Date().toLocaleString('id-ID')}`]]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(finalData)

      // Column widths
      ws['!cols'] = [
        { wch: 5 },  // No
        { wch: 15 }, // Kode
        { wch: 18 }, // NIK
        { wch: 30 }, // Nama
        { wch: 25 }, // Unit
        { wch: 25 }, // Jabatan
        { wch: 15 }, // Status Kerja
        { wch: 12 }, // Pajak
        { wch: 15 }, // Bank
        { wch: 20 }, // Rekening
        { wch: 12 }  // Status Akun
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Laporan_Pegawai_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      })
    }
  } catch (error: any) {
    console.error('Error exporting pegawai:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export pegawai' },
      { status: 500 }
    )
  }
}
