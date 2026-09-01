import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import {
  formatNumber,
  formatSubIndicatorScoringInfo,
  formatSubIndicatorExcelCriteria
} from '@/lib/export/kpi-export-utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const unitId = searchParams.get('unitId')
    const format = searchParams.get('format') || 'excel'

    if (!unitId) {
      return NextResponse.json({ error: 'Unit ID diperlukan' }, { status: 400 })
    }

    const adminClient = await createAdminClient()
    const supabase = await createClient()

    // Get settings for app info
    const { data: settingsData } = await adminClient
      .from('t_settings')
      .select('key, value')
      .in('key', ['company_info', 'footer'])

    let appSettings = {
      appName: 'JASPEL',
      developerName: '',
      organizationName: '',
      logo: '',
      footerText: ''
    }

    if (settingsData) {
      const companyInfo = (settingsData.find(s => s.key === 'company_info')?.value as any) || {}
      const footerInfo = (settingsData.find(s => s.key === 'footer')?.value as any) || {}

      appSettings = {
        appName: companyInfo.appName || 'JASPEL',
        developerName: companyInfo.developerName || '',
        organizationName: companyInfo.name || '',
        logo: companyInfo.logo || '',
        footerText: typeof footerInfo === 'string' ? footerInfo : (footerInfo.text || '')
      }
    }

    // Get unit info
    const { data: unit, error: unitError } = await adminClient
      .from('m_units')
      .select('code, name')
      .eq('id', unitId)
      .single()

    if (unitError || !unit) {
      return NextResponse.json({ error: 'Unit tidak ditemukan' }, { status: 404 })
    }

    // Get KPI categories first
    const { data: categories, error: categoriesError } = await adminClient
      .from('m_kpi_categories')
      .select('*')
      .eq('unit_id', unitId)
      .eq('is_active', true)
      .order('category')

    if (categoriesError) {
      return NextResponse.json({ error: 'Gagal mengambil data kategori KPI' }, { status: 500 })
    }

    // Get indicators for each category
    const categoriesWithData = []
    for (const category of categories || []) {
      const { data: indicators, error: indicatorsError } = await adminClient
        .from('m_kpi_indicators')
        .select('*')
        .eq('category_id', category.id)
        .eq('is_active', true)
        .order('code')

      if (indicatorsError) {
        console.error('Error fetching indicators:', indicatorsError)
        continue
      }

      // Get sub indicators for each indicator
      const indicatorsWithSubs = []
      for (const indicator of indicators || []) {
        const { data: subIndicators, error: subError } = await adminClient
          .from('m_kpi_sub_indicators')
          .select('*')
          .eq('indicator_id', indicator.id)
          .eq('is_active', true)
          .order('code')

        if (subError) {
          console.error('Error fetching sub indicators:', subError)
        }

        indicatorsWithSubs.push({
          ...indicator,
          m_kpi_sub_indicators: subIndicators || []
        })
      }

      categoriesWithData.push({
        ...category,
        m_kpi_indicators: indicatorsWithSubs
      })
    }

    if (format === 'excel') {
      return generateExcelReport(unit, categoriesWithData || [], appSettings)
    } else if (format === 'pdf') {
      return generatePDFReport(unit, categoriesWithData || [], appSettings)
    } else {
      return NextResponse.json({ error: 'Format tidak didukung' }, { status: 400 })
    }

  } catch (error: any) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Gagal mengekspor laporan' }, { status: 500 })
  }
}

async function generatePDFReport(unit: any, categories: any[], appSettings: any) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const { addKopSurat, addPdfFooters } = await import('@/lib/export/pdf-export')
  const { getCompanyInfoServer, getFooterServer } = await import('@/lib/services/settings.server.service')

  const companyInfo = await getCompanyInfoServer()
  const footerText = await getFooterServer()

  const doc = new jsPDF()

  // Professional Kop Surat
  await addKopSurat(doc, companyInfo)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('LAPORAN KONFIGURASI KPI UNIT', 105, 42, { align: 'center' })
  doc.setFontSize(11)
  doc.text(`${unit.code} - ${unit.name}`, 105, 48, { align: 'center' })
  doc.setFontSize(9)
  doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 105, 54, { align: 'center' })

  let currentY = 70
  let grandTotalIndicators = 0
  let grandTotalSubIndicators = 0

  categories.forEach((cat) => {
    // Category Header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`Kategori ${cat.category}: ${cat.category_name} (${cat.weight_percentage}%)`, 20, currentY)
    currentY += 7

    const indicators = cat.m_kpi_indicators || []
    let totalWeightInCategory = 0

    const tableBody: any[] = []
    indicators.forEach((ind: any) => {
      grandTotalIndicators++
      totalWeightInCategory += Number(ind.weight_percentage)

      // Main Indicator Row
      tableBody.push([
        { content: ind.code, styles: { fontStyle: 'bold' } },
        { content: ind.name, styles: { fontStyle: 'bold' } },
        { content: `${ind.weight_percentage}%`, styles: { fontStyle: 'bold' } },
        { content: formatNumber(ind.target_value), styles: { fontStyle: 'bold' } },
        { content: ind.measurement_unit || '-', styles: { fontStyle: 'bold' } },
        { content: ind.base_index_value && ind.base_index_value > 0 ? formatNumber(ind.base_index_value) : '-', styles: { fontStyle: 'bold' } }
      ])

      // Sub Indicators Rows
      const subs = ind.m_kpi_sub_indicators || []
      subs.forEach((sub: any) => {
        grandTotalSubIndicators++
        const scoringInfo = formatSubIndicatorScoringInfo(sub)
        const subDesc = sub.description ? `\n  Deskripsi: ${sub.description}` : ''

        tableBody.push([
          `  ${sub.code}`,
          `  ${sub.name}${subDesc}${scoringInfo}`,
          `${sub.weight_percentage}%`,
          formatNumber(sub.target_value),
          sub.measurement_unit || '-',
          sub.base_index_value && sub.base_index_value > 0 ? formatNumber(sub.base_index_value) : '-'
        ])
      })
    })

    autoTable(doc, {
      startY: currentY,
      head: [['Kode', 'Indikator / Sub-Indikator', 'Bobot', 'Target', 'Satuan', 'Tarif Dasar']],
      body: tableBody,
      foot: [[
        '',
        { content: 'SUBTOTAL BOBOT INDIKATOR', styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `${totalWeightInCategory}%`, styles: { fontStyle: 'bold' } },
        '',
        '',
        ''
      ]],
      theme: 'grid',
      headStyles: { fillColor: [52, 73, 94], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0 },
      styles: { fontSize: 8 },
      margin: { left: 20, right: 20 },
      didDrawPage: (data) => {
        currentY = data.cursor?.y || currentY
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 10

    // Add page if needed
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }
  })

  // Grand Summary at the end of PDF
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('RINGKASAN TOTAL:', 20, currentY)
  currentY += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Total Kategori: ${categories.length}`, 20, currentY)
  currentY += 5
  doc.text(`Total Indikator: ${grandTotalIndicators}`, 20, currentY)
  currentY += 5
  doc.text(`Total Sub-Indikator: ${grandTotalSubIndicators}`, 20, currentY)

  await addPdfFooters(doc, footerText)

  const pdfOutput = doc.output('arraybuffer')

  return new NextResponse(pdfOutput, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="KPI_Config_${unit.code}_${new Date().toISOString().split('T')[0]}.pdf"`
    }
  })
}

function generateExcelReport(unit: any, categories: any[], appSettings: any) {
  const workbook = XLSX.utils.book_new()

  // Summary Sheet
  const summaryData = [
    ['LAPORAN STRUKTUR KPI'],
    ['Unit:', `${unit.code} - ${unit.name}`],
    ['Tanggal:', new Date().toLocaleDateString('id-ID')],
    ['Aplikasi:', appSettings.appName || 'JASPEL'],
    [],
    ['RINGKASAN STRUKTUR KPI'],
    ['Kategori', 'Bobot (%)', 'Jumlah Indikator', 'Jumlah Sub Indikator'],
  ]

  let totalCategories = 0
  let totalIndicators = 0
  let totalSubIndicators = 0
  let totalCategoryWeight = 0

  categories.forEach(cat => {
    const indicators = cat.m_kpi_indicators || []
    const subIndicatorCount = indicators.reduce((sum: number, ind: any) =>
      sum + (ind.m_kpi_sub_indicators?.length || 0), 0)

    summaryData.push([
      `${cat.category} - ${cat.category_name}`,
      cat.weight_percentage.toString(),
      indicators.length.toString(),
      subIndicatorCount.toString()
    ])

    totalCategories++
    totalIndicators += indicators.length
    totalSubIndicators += subIndicatorCount
    totalCategoryWeight += Number(cat.weight_percentage)
  })

  summaryData.push(
    ['TOTAL', totalCategoryWeight.toString(), totalIndicators.toString(), totalSubIndicators.toString()]
  )

  summaryData.push(
    [],
    ['Validasi Bobot Kategori:', totalCategoryWeight === 100 ? 'VALID ✓' : `TIDAK VALID (${totalCategoryWeight}%)`],
    []
  )

  // Add footer information if available
  if (appSettings.organizationName) {
    summaryData.push(['Organisasi:', appSettings.organizationName])
  }
  if (appSettings.developerName) {
    summaryData.push(['Dikembangkan oleh:', appSettings.developerName])
  }
  if (appSettings.footerText) {
    summaryData.push(['Catatan:', appSettings.footerText])
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')

  // Detail sheets for each category
  categories.forEach(category => {
    const categoryData = [
      [`KATEGORI ${category.category}: ${category.category_name}`],
      ['Bobot Kategori:', `${category.weight_percentage}%`],
      ['Deskripsi:', category.description || '-'],
      [],
      ['INDIKATOR DAN SUB INDIKATOR'],
      []
    ]

    const indicators = category.m_kpi_indicators || []
    let totalIndicatorWeight = 0

    indicators.forEach((indicator: any) => {
      totalIndicatorWeight += Number(indicator.weight_percentage)

      categoryData.push([
        'INDIKATOR:',
        indicator.code,
        indicator.name,
        `Bobot: ${indicator.weight_percentage}%`,
        `Target: ${indicator.target_value || 0}`,
        `Satuan: ${indicator.measurement_unit || '-'}`,
        `Tarif Dasar: ${indicator.base_index_value || '-'}`
      ])

      if (indicator.description) {
        categoryData.push(['Deskripsi:', indicator.description])
      }

      // Add sub indicators
      const subIndicators = indicator.m_kpi_sub_indicators || []
      if (subIndicators.length > 0) {
        categoryData.push([])
        categoryData.push(['SUB INDIKATOR:', 'Kode', 'Nama', 'Bobot (%)', 'Target', 'Satuan', 'Tarif Dasar', 'Kriteria Penilaian'])

        let totalSubWeight = 0
        subIndicators.forEach((sub: any) => {
          totalSubWeight += Number(sub.weight_percentage)

          const criteriaText = formatSubIndicatorExcelCriteria(sub)

          categoryData.push([
            '',
            sub.code,
            sub.name,
            sub.weight_percentage,
            formatNumber(sub.target_value),
            sub.measurement_unit || '-',
            sub.base_index_value ? formatNumber(sub.base_index_value) : '-',
            criteriaText
          ])
        })

        categoryData.push(['Total Bobot Sub Indikator:', `${totalSubWeight}%`, totalSubWeight === 100 ? 'VALID ✓' : 'PERLU PENYESUAIAN'])
        categoryData.push([])
      }

      categoryData.push([])
    })

    categoryData.push(['VALIDASI BOBOT INDIKATOR'])
    categoryData.push(['Total Bobot Indikator:', `${totalIndicatorWeight}%`])
    categoryData.push(['Status:', totalIndicatorWeight === 100 ? 'VALID ✓' : `PERLU PENYESUAIAN (harus 100%)`])

    const categorySheet = XLSX.utils.aoa_to_sheet(categoryData)
    XLSX.utils.book_append_sheet(workbook, categorySheet, category.category)
  })

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Laporan_KPI_${unit.code}_${new Date().toISOString().split('T')[0]}.xlsx"`
    }
  })
}
