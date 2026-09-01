import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { addKopSurat, addPdfFooters } from '@/lib/export/pdf-export'
import { getCompanyInfoServer, getFooterServer } from '@/lib/services/settings.server.service'
import { buildExcelKopHeader } from '@/lib/export/excel-export'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'excel'
    const unitId = searchParams.get('unitId')
    const search = searchParams.get('search')

    // Use admin client to bypass RLS and get employees matching filters
    const adminClient = await createAdminClient()
    let query = adminClient
      .from('m_employees')
      .select(`
        *,
        m_units (
          id,
          code,
          name
        )
      `)
      .neq('role', 'superadmin')
      .order('employee_code', { ascending: true })

    if (unitId && unitId !== 'all') {
      query = query.eq('unit_id', unitId)
    }

    if (search && search.trim()) {
      const trimmed = search.trim()
      query = query.or(`full_name.ilike.%${trimmed}%,employee_code.ilike.%${trimmed}%,position.ilike.%${trimmed}%,employment_status.ilike.%${trimmed}%`)
    }

    const { data: pegawai, error } = await query

    if (error) throw error

    const companyInfo = await getCompanyInfoServer()
    const footerText = await getFooterServer()

    // Determine filter unit label for Kop subtitle
    let unitFilterName = 'Semua Unit Kerja'
    if (unitId && unitId !== 'all') {
      const { data: unitData } = await adminClient
        .from('m_units')
        .select('name')
        .eq('id', unitId)
        .single()
      if (unitData?.name) {
        unitFilterName = unitData.name
      }
    }

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
      })

      // Kop Surat
      await addKopSurat(doc, companyInfo)

      const pageWidth = doc.internal.pageSize.width
      const centerX = pageWidth / 2

      // Title & Filter Subtitle
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 58, 138)
      doc.text('LAPORAN DATA PEGAWAI TERPADU', centerX, 36, { align: 'center' })

      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      doc.text(`Filter Unit: ${unitFilterName}  |  Tanggal Cetak: ${reportDate}  |  Total Data: ${(pegawai || []).length} Pegawai`, centerX, 41, { align: 'center' })

      // Comprehensive PDF Table Data (Including all input fields)
      const tableRows = (pegawai || []).map((p, index) => {
        const statusGol = [
          p.employment_status || '-',
          p.employment_status === 'PNS' && p.pns_grade && p.pns_grade !== '-' && p.pns_grade !== 'null' ? `(Gol. ${p.pns_grade})` : null
        ].filter(Boolean).join(' ')

        const emailTelp = [
          p.email ? p.email : null,
          p.phone ? p.phone : null
        ].filter(Boolean).join('\n') || '-'

        const taxInfo = [
          p.tax_status || '-',
          p.tax_type ? `[${p.tax_type}]` : null
        ].filter(Boolean).join(' ')

        const bankInfo = p.bank_name ? (
          `${p.bank_name}: ${p.bank_account_number || '-'}` + (p.bank_account_name ? `\n(a.n. ${p.bank_account_name})` : '')
        ) : '-'

        return [
          index + 1,
          p.employee_code || '-',
          p.nik || '-',
          p.full_name || '-',
          p.m_units?.name || '-',
          p.position || '-',
          statusGol,
          taxInfo,
          emailTelp,
          bankInfo,
          p.is_active ? 'Aktif' : 'Non-Aktif'
        ]
      })

      autoTable(doc, {
        startY: 46,
        head: [['No', 'NIP / Kode', 'NIK', 'Nama Lengkap', 'Unit Kerja', 'Jabatan', 'Status & Gol.', 'Pajak', 'Email & Telp', 'Rekening Bank', 'Status']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          valign: 'middle'
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          valign: 'middle',
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 20, fontStyle: 'bold' },
          2: { cellWidth: 24 },
          3: { cellWidth: 38, fontStyle: 'bold' },
          4: { cellWidth: 30 },
          5: { cellWidth: 25 },
          6: { cellWidth: 23, halign: 'center' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 32 },
          9: { cellWidth: 33 },
          10: { cellWidth: 15, halign: 'center' }
        }
      })

      // Signature area on final page
      const pageHeight = doc.internal.pageSize.height
      let finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : 160

      if (finalY + 35 > pageHeight - 15) {
        doc.addPage()
        await addKopSurat(doc, companyInfo)
        finalY = 45
      }

      const rightMarginX = pageWidth - 65
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 41, 59)
      doc.text(`Sungai Bahar, ${reportDate}`, rightMarginX, finalY)
      doc.text('Pengelola Kepegawaian,', rightMarginX, finalY + 5)
      doc.text('( ___________________________ )', rightMarginX, finalY + 25)
      doc.text('NIP. ........................................', rightMarginX, finalY + 30)

      await addPdfFooters(doc, footerText)

      const pdfOutput = doc.output('arraybuffer')

      return new NextResponse(pdfOutput, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Laporan_Data_Pegawai_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      })
    } else {
      // Excel Export with formal Kop Surat and complete fields
      const subtitleText = `Filter Unit: ${unitFilterName}  |  Tanggal Cetak: ${reportDate}  |  Total Data: ${(pegawai || []).length} Pegawai`
      const kopSurat = buildExcelKopHeader(companyInfo, 'LAPORAN DATA PEGAWAI TERPADU', subtitleText)

      const headers = [
        'No',
        'Kode Pegawai / NIP',
        'NIK',
        'Nama Lengkap',
        'Email',
        'Unit Kerja',
        'Jabatan',
        'Status Kepegawaian',
        'Golongan PNS',
        'Status Pajak (PTKP)',
        'Mekanisme Pajak',
        'No. Telepon',
        'Nama Bank',
        'No. Rekening Bank',
        'Nama Pemegang Rekening',
        'Status Akun'
      ]

      const employeeData = (pegawai || []).map((p, index) => [
        index + 1,
        p.employee_code || '-',
        p.nik || '-',
        p.full_name || '-',
        p.email || '-',
        p.m_units?.name || '-',
        p.position || '-',
        p.employment_status || '-',
        p.employment_status === 'PNS' && p.pns_grade && p.pns_grade !== 'null' && p.pns_grade !== '-' ? `Golongan ${p.pns_grade}` : '-',
        p.tax_status || '-',
        p.tax_type || '-',
        p.phone || '-',
        p.bank_name || '-',
        p.bank_account_number || '-',
        p.bank_account_name || '-',
        p.is_active ? 'Aktif' : 'Nonaktif'
      ])

      const finalData = [
        ...kopSurat,
        headers,
        ...employeeData,
        [],
        [footerText],
        [`Dicetak: ${new Date().toLocaleString('id-ID')}`]
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(finalData)

      // Column widths for complete Excel format
      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 20 }, // Kode/NIP
        { wch: 20 }, // NIK
        { wch: 32 }, // Nama
        { wch: 28 }, // Email
        { wch: 28 }, // Unit
        { wch: 25 }, // Jabatan
        { wch: 20 }, // Status Kepeg.
        { wch: 15 }, // Gol.
        { wch: 18 }, // Status Pajak
        { wch: 16 }, // Mekanisme
        { wch: 18 }, // Telp
        { wch: 15 }, // Bank
        { wch: 22 }, // Rekening
        { wch: 28 }, // Pemegang Rek
        { wch: 14 }  // Status Akun
      ]

      // Format header row style in Excel
      const headerRowIdx = kopSurat.length
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r: headerRowIdx, c })
        if (ws[cellAddr]) {
          ws[cellAddr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1E3A8A" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai')
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Laporan_Data_Pegawai_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      })
    }
  } catch (error: any) {
    console.error('Error exporting pegawai:', error)
    return NextResponse.json(
      { error: error.message || 'Gagal mengekspor data pegawai' },
      { status: 500 }
    )
  }
}
