import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(request: NextRequest) {
  try {
    const adminClient = await createAdminClient()
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'excel'

    // Get all units with employee count
    const { data: units, error } = await adminClient
      .from('m_units')
      .select('*')
      .order('code', { ascending: true })

    if (error) throw error

    // Get employee counts
    const unitsWithCounts = await Promise.all(
      (units || []).map(async (unit: any) => {
        const { count } = await adminClient
          .from('m_employees')
          .select('*', { count: 'exact', head: true })
          .eq('unit_id', unit.id)

        return {
          ...unit,
          employee_count: count || 0
        }
      })
    )

    // Calculate Totals
    const totalProportion = unitsWithCounts.reduce((sum, unit) => sum + (Number(unit.proportion_percentage) || 0), 0)
    const totalEmployees = unitsWithCounts.reduce((sum, unit) => sum + (Number(unit.employee_count) || 0), 0)

    const { getCompanyInfoServer, getFooterServer } = await import('@/lib/services/settings.server.service')
    const companyInfo = await getCompanyInfoServer()
    const footerText = await getFooterServer()

    if (format === 'pdf') {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const { addKopSurat, addPdfFooters } = await import('@/lib/export/pdf-export')

      const doc = new jsPDF()

      // Dynamic Kop Surat from settings
      await addKopSurat(doc, companyInfo)

      // Judul Laporan
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 58, 138)
      doc.text('DAFTAR UNIT KERJA', 105, 38, { align: 'center' })
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text(`Periode: ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`, 105, 44, { align: 'center' })

      // Tabel
      const tableData = unitsWithCounts.map((unit: any, index: number) => [
        index + 1,
        unit.code,
        unit.name,
        unit.proportion_percentage.toFixed(2) + '%',
        unit.employee_count,
        unit.is_active ? 'Aktif' : 'Nonaktif'
      ])

      autoTable(doc, {
        startY: 48,
        head: [['No', 'Kode', 'Nama Unit', 'Proporsi', 'Pegawai', 'Status']],
        body: tableData,
        foot: [[
          '',
          '',
          { content: 'TOTAL', styles: { halign: 'right', fontStyle: 'bold' } },
          { content: totalProportion.toFixed(2) + '%', styles: { fontStyle: 'bold' } },
          { content: totalEmployees.toString(), styles: { fontStyle: 'bold' } },
          ''
        ]],
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240, 240, 240], textColor: 0 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 25 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 }
        }
      })

      // Footer with signature
      const finalY = (doc as any).lastAutoTable.finalY || 70
      if (finalY < 230) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0)
        doc.text(`Sungai Bahar, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 140, finalY + 15)
        doc.text('Kepala Bagian Umum,', 140, finalY + 20)

        doc.setFont('helvetica', 'bold')
        doc.text('( ____________________ )', 140, finalY + 40)
      }

      await addPdfFooters(doc, footerText)

      const pdfOutput = doc.output('arraybuffer')

      return new NextResponse(pdfOutput, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Laporan_Unit_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      })
    } else {
      // Generate Excel with formal header from settings
      const contactStr = [
        companyInfo.phone ? `Telp: ${companyInfo.phone}` : null,
        companyInfo.email ? `Email: ${companyInfo.email}` : null
      ].filter(Boolean).join(' | ')

      const excelData = unitsWithCounts.map((unit: any, index: number) => ({
        'No': index + 1,
        'Kode Unit': unit.code,
        'Nama Unit': unit.name,
        'Proporsi (%)': unit.proportion_percentage.toFixed(2),
        'Jumlah Pegawai': unit.employee_count,
        'Status': unit.is_active ? 'Aktif' : 'Nonaktif'
      }))

      // Add Total Row for Excel
      excelData.push({
        'No': null as any,
        'Kode Unit': '',
        'Nama Unit': 'TOTAL',
        'Proporsi (%)': totalProportion.toFixed(2),
        'Jumlah Pegawai': totalEmployees as any,
        'Status': ''
      })

      const wb = XLSX.utils.book_new()

      const { buildExcelKopHeader } = await import('@/lib/export/excel-export')
      const header = buildExcelKopHeader(companyInfo, 'DAFTAR UNIT KERJA', `Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`)

      const ws = XLSX.utils.aoa_to_sheet(header)
      XLSX.utils.sheet_add_json(ws, excelData, { origin: `A${header.length + 1}` })
      XLSX.utils.sheet_add_aoa(ws, [[footerText], [`Dicetak: ${new Date().toLocaleString('id-ID')}`]], { origin: `A${header.length + 1 + excelData.length + 2}` })

      // Set column widths
      ws['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Data Unit')

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Laporan_Unit_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      })
    }
  } catch (error: any) {
    console.error('Error exporting units:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to export units' },
      { status: 500 }
    )
  }
}
