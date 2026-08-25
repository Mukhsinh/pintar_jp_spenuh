import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { isMedicalUnit } from '@/lib/utils/medical-unit'
import { calculateCategoryScore, calculateTotalScore } from '@/lib/utils/score-calculator'

export async function GET(request: NextRequest) {
  try {
    const adminClient = await createAdminClient()
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')
    const unitId = searchParams.get('unit_id')

    if (!period) {
      return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 })
    }

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = user.user_metadata?.role

    // Build query for assessment data
    let query = adminClient
      .from('t_kpi_assessments')
      .select(`
        *,
        m_employees!employee_id (
          full_name,
          employee_id,
          unit_id,
          m_units!unit_id (name)
        ),
        m_kpi_indicators!indicator_id (
          name,
          code,
          target_value,
          weight_percentage,
          measurement_unit,
          m_kpi_categories!category_id (
            category,
            category_name
          )
        ),
        assessor:auth.users!assessor_id (
          id,
          email
        )
      `)
      .eq('period', period)
      .order('m_employees(full_name)')

    // Apply unit filtering based on role
    if (userRole === 'unit_manager') {
      const { data: userEmployee } = await adminClient
        .from('m_employees')
        .select('unit_id')
        .eq('user_id', user.id)
        .single()

      if (userEmployee) {
        query = query.eq('m_employees.unit_id', userEmployee.unit_id)
      }
    } else if (unitId && unitId !== 'all') {
      query = query.eq('m_employees.unit_id', unitId)
    }

    const { data: assessmentData, error } = await query

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!assessmentData || assessmentData.length === 0) {
      return NextResponse.json({ success: false, error: 'No assessment data found' }, { status: 404 })
    }

    const { getCompanyInfoServer, getFooterServer } = await import('@/lib/services/settings.server.service')
    const companyInfo = await getCompanyInfoServer()
    const footerText = await getFooterServer()

    const { buildExcelKopHeader } = await import('@/lib/export/excel-export')
    const header = buildExcelKopHeader(companyInfo, 'LAPORAN DETAIL PENILAIAN KPI', `Periode: ${period}`)

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Sheet 1: Detail Penilaian
    const detailData = assessmentData.map((assessment: any) => ({
      'Periode': assessment.period,
      'Unit': assessment.m_employees?.m_units?.name || '-',
      'NIP': assessment.m_employees?.employee_id || '-',
      'Nama Pegawai': assessment.m_employees?.full_name || '-',
      'Kategori KPI': assessment.m_kpi_indicators?.m_kpi_categories?.category || '-',
      'Nama Kategori': assessment.m_kpi_indicators?.m_kpi_categories?.category_name || '-',
      'Kode Indikator': assessment.m_kpi_indicators?.code || '-',
      'Nama Indikator': assessment.m_kpi_indicators?.name || '-',
      'Satuan': assessment.m_kpi_indicators?.measurement_unit || '-',
      'Target': assessment.target_value,
      'Realisasi': assessment.realization_value,
      'Pencapaian (%)': assessment.achievement_percentage?.toFixed(2) || '0.00',
      'Bobot (%)': assessment.weight_percentage,
      'Skor': assessment.score?.toFixed(2) || '0.00',
      'Catatan': assessment.notes || '-',
      'Penilai': assessment.assessor?.email || 'Unknown',
      'Tanggal Penilaian': assessment.created_at ? new Date(assessment.created_at).toLocaleDateString('id-ID') : '-',
      'Terakhir Diubah': assessment.updated_at ? new Date(assessment.updated_at).toLocaleDateString('id-ID') : '-'
    }))

    const detailSheet = XLSX.utils.aoa_to_sheet(header)
    XLSX.utils.sheet_add_json(detailSheet, detailData, { origin: `A${header.length + 1}` })
    XLSX.utils.sheet_add_aoa(detailSheet, [[footerText], [`Dicetak: ${new Date().toLocaleString('id-ID')}`]], { origin: `A${header.length + 1 + detailData.length + 2}` })

    detailSheet['!cols'] = [
      { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 20 },
      { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail Penilaian')

    // Sheet 2: Ringkasan per Pegawai
    const employeeSummaryMap = new Map()
    assessmentData.forEach((assessment: any) => {
      const employeeId = assessment.employee_id
      if (!employeeSummaryMap.has(employeeId)) {
        employeeSummaryMap.set(employeeId, {
          unit: assessment.m_employees?.m_units?.name || '-',
          nip: assessment.m_employees?.employee_id || '-',
          nama: assessment.m_employees?.full_name || '-',
          p1_scores: [],
          p2_scores: [],
          p3_scores: [],
          total_indicators: 0,
          assessed_indicators: 0
        })
      }
      const employee = employeeSummaryMap.get(employeeId)
      const category = assessment.m_kpi_indicators?.m_kpi_categories?.category?.toLowerCase() || ''
      const score = assessment.score || 0
      employee.total_indicators++
      if (assessment.score !== null && assessment.score !== undefined) {
        employee.assessed_indicators++
      }
      if (category === 'p1') employee.p1_scores.push(score)
      else if (category === 'p2') employee.p2_scores.push(score)
      else if (category === 'p3') employee.p3_scores.push(score)
    })

    const summaryData = Array.from(employeeSummaryMap.values()).map((employee: any) => {
      const isMedical = isMedicalUnit(null, employee.unit);
      const p1Average = calculateCategoryScore(employee.p1_scores, isMedical);
      const p2Average = calculateCategoryScore(employee.p2_scores, isMedical);
      const p3Average = calculateCategoryScore(employee.p3_scores, isMedical);
      const totalAverage = calculateTotalScore(p1Average, p2Average, p3Average, isMedical);
      const completionRate = employee.total_indicators > 0 ? (employee.assessed_indicators / employee.total_indicators) * 100 : 0;

      return {
        'Unit': employee.unit,
        'NIP': employee.nip,
        'Nama Pegawai': employee.nama,
        'Total Indikator': employee.total_indicators,
        'Sudah Dinilai': employee.assessed_indicators,
        'Tingkat Penyelesaian (%)': completionRate.toFixed(1),
        'Rata-rata P1': p1Average.toFixed(2),
        'Rata-rata P2': p2Average.toFixed(2),
        'Rata-rata P3': p3Average.toFixed(2),
        'Rata-rata Total': totalAverage.toFixed(2),
        'Status': completionRate === 100 ? 'Selesai' : completionRate > 0 ? 'Sebagian' : 'Belum Dinilai'
      }
    })

    // Add Grand Total for Employee Summary
    const totalP1 = summaryData.reduce((sum, item) => sum + Number(item['Rata-rata P1']), 0) / (summaryData.length || 1)
    const totalP2 = summaryData.reduce((sum, item) => sum + Number(item['Rata-rata P2']), 0) / (summaryData.length || 1)
    const totalP3 = summaryData.reduce((sum, item) => sum + Number(item['Rata-rata P3']), 0) / (summaryData.length || 1)
    const totalG = summaryData.reduce((sum, item) => sum + Number(item['Rata-rata Total']), 0) / (summaryData.length || 1)

    summaryData.push({
      'Unit': 'TOTAL RATA-RATA',
      'NIP': '',
      'Nama Pegawai': '',
      'Total Indikator': summaryData.reduce((sum, item) => sum + Number(item['Total Indikator']), 0),
      'Sudah Dinilai': summaryData.reduce((sum, item) => sum + Number(item['Sudah Dinilai']), 0),
      'Tingkat Penyelesaian (%)': '',
      'Rata-rata P1': totalP1.toFixed(2),
      'Rata-rata P2': totalP2.toFixed(2),
      'Rata-rata P3': totalP3.toFixed(2),
      'Rata-rata Total': totalG.toFixed(2),
      'Status': ''
    })

    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    summarySheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan Pegawai')

    // Sheet 3: Ringkasan per Unit
    if (!unitId || unitId === 'all') {
      const unitSummaryMap = new Map()
      assessmentData.forEach((assessment: any) => {
        const unitName = assessment.m_employees?.m_units?.name || 'Unknown'
        if (!unitSummaryMap.has(unitName)) {
          unitSummaryMap.set(unitName, {
            employees: new Set(),
            total_assessments: 0,
            total_score: 0,
            p1_scores: [],
            p2_scores: [],
            p3_scores: []
          })
        }
        const unit = unitSummaryMap.get(unitName)
        unit.employees.add(assessment.employee_id)
        unit.total_assessments++
        const score = assessment.score || 0
        unit.total_score += score
        const category = assessment.m_kpi_indicators?.m_kpi_categories?.category?.toLowerCase() || ''
        if (category === 'p1') unit.p1_scores.push(score)
        else if (category === 'p2') unit.p2_scores.push(score)
        else if (category === 'p3') unit.p3_scores.push(score)
      })

      const unitData = Array.from(unitSummaryMap.entries()).map(([unitName, data]: [string, any]) => {
        const p1Average = data.p1_scores.length > 0 ? data.p1_scores.reduce((a: number, b: number) => a + b, 0) / data.p1_scores.length : 0
        const p2Average = data.p2_scores.length > 0 ? data.p2_scores.reduce((a: number, b: number) => a + b, 0) / data.p2_scores.length : 0
        const p3Average = data.p3_scores.length > 0 ? data.p3_scores.reduce((a: number, b: number) => a + b, 0) / data.p3_scores.length : 0
        const overallAverage = data.total_assessments > 0 ? data.total_score / data.total_assessments : 0

        return {
          'Unit': unitName,
          'Jumlah Pegawai': data.employees.size,
          'Total Penilaian': data.total_assessments,
          'Rata-rata P1': p1Average.toFixed(2),
          'Rata-rata P2': p2Average.toFixed(2),
          'Rata-rata P3': p3Average.toFixed(2),
          'Rata-rata Keseluruhan': overallAverage.toFixed(2)
        }
      })

      // Add Grand Total for Unit Summary
      unitData.push({
        'Unit': 'TOTAL RATA-RATA',
        'Jumlah Pegawai': unitData.reduce((sum, item) => sum + (item['Jumlah Pegawai'] as number), 0),
        'Total Penilaian': unitData.reduce((sum, item) => sum + (item['Total Penilaian'] as number), 0),
        'Rata-rata P1': (unitData.reduce((sum, item) => sum + Number(item['Rata-rata P1']), 0) / (unitData.length || 1)).toFixed(2),
        'Rata-rata P2': (unitData.reduce((sum, item) => sum + Number(item['Rata-rata P2']), 0) / (unitData.length || 1)).toFixed(2),
        'Rata-rata P3': (unitData.reduce((sum, item) => sum + Number(item['Rata-rata P3']), 0) / (unitData.length || 1)).toFixed(2),
        'Rata-rata Keseluruhan': (unitData.reduce((sum, item) => sum + Number(item['Rata-rata Keseluruhan']), 0) / (unitData.length || 1)).toFixed(2)
      })

      const unitSheet = XLSX.utils.json_to_sheet(unitData)
      unitSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(workbook, unitSheet, 'Ringkasan Unit')
    }

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
    const filename = `laporan-penilaian-${period}${unitId && unitId !== 'all' ? `-${unitId}` : ''}.xlsx`

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excelBuffer.length.toString(),
      },
    })

  } catch (error: any) {
    console.error('Assessment export error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}