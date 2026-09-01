import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createAdminClient } from '../supabase/server'
import { addKopSurat, addPdfFooters } from './pdf-export'
import { getCompanyInfoServer, getFooterServer } from '../services/settings.server.service'

import { formatNumber, formatSubIndicatorScoringInfo } from './kpi-export-utils'

export async function generateSystemGuide(unitId?: string): Promise<Buffer> {
  const adminClient = await createAdminClient()

  const companyInfo = await getCompanyInfoServer()
  const footerText = await getFooterServer()

  const doc = new jsPDF()

  // Professional Kop Surat from settings
  await addKopSurat(doc, companyInfo)

  if (!unitId) {
    // General System Guide
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('PANDUAN SISTEM PENILAIAN KPI (JASPEL)', 105, 50, { align: 'center' })

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('1. PENDAHULUAN', 20, 65)
    doc.setFont('helvetica', 'normal')
    doc.text('Sistem JASPEL menggunakan metodologi Key Performance Indicator (KPI) untuk mengukur kinerja', 20, 72)
    doc.text('pegawai secara objektif dan transparan. Penilaian terbagi menjadi 3 kategori utama:', 20, 77)

    doc.setFont('helvetica', 'bold')
    doc.text('A. Kategori P1 (Kinerja Utama/Pelayanan)', 25, 87)
    doc.setFont('helvetica', 'normal')
    doc.text('Mengukur output layanan langsung yang diberikan oleh pegawai sesuai dengan tupoksi.', 25, 92)

    doc.setFont('helvetica', 'bold')
    doc.text('B. Kategori P2 (Kinerja Tambahan/Administrasi)', 25, 102)
    doc.setFont('helvetica', 'normal')
    doc.text('Mengukur kontribusi pegawai dalam hal administrasi, pelaporan, dan tugas tambahan.', 25, 107)

    doc.setFont('helvetica', 'bold')
    doc.text('C. Kategori P3 (Perilaku & Kedisiplinan)', 25, 117)
    doc.setFont('helvetica', 'normal')
    doc.text('Mengukur kedisiplinan (absensi) dan perilaku kerja pegawai sehari-hari.', 25, 122)

    doc.setFont('helvetica', 'bold')
    doc.text('2. STRUKTUR PENILAIAN', 20, 137)
    doc.setFont('helvetica', 'normal')
    doc.text('Setiap kategori memiliki indikator, dan setiap indikator dapat dipecah menjadi sub-indikator.', 20, 144)
    doc.text('Total bobot indikator dalam setiap kategori harus mencapai 100%.', 20, 149)

    doc.setFont('helvetica', 'bold')
    doc.text('3. KRITERIA SKORING', 20, 164)
    doc.setFont('helvetica', 'normal')
    doc.text('Skor diberikan dalam skala 1 sampai 5 berdasarkan pencapaian terhadap target yang ditentukan.', 20, 171)

  } else {
    // Unit Specific Guide/Config
    const { data: unit } = await adminClient
      .from('m_units')
      .select('code, name')
      .eq('id', unitId)
      .single()

    if (unit) {
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('PANDUAN DAN STRUKTUR KPI UNIT', 105, 50, { align: 'center' })
      doc.setFontSize(12)
      doc.text(`${unit.code} - ${unit.name}`, 105, 57, { align: 'center' })

      // Get categories and data
      const { data: categories } = await adminClient
        .from('m_kpi_categories')
        .select('*')
        .eq('unit_id', unitId)
        .eq('is_active', true)
        .order('category')

      let currentY = 70

      for (const cat of categories || []) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(`KATEGORI ${cat.category}: ${cat.category_name} (Bobot: ${cat.weight_percentage}%)`, 20, currentY)
        currentY += 7

        const { data: indicators } = await adminClient
          .from('m_kpi_indicators')
          .select('*')
          .eq('category_id', cat.id)
          .eq('is_active', true)
          .order('code')

        const tableBody = []
        for (const ind of indicators || []) {
          tableBody.push([
            { content: ind.code, styles: { fontStyle: 'bold' } },
            { content: ind.name, styles: { fontStyle: 'bold' } },
            `${ind.weight_percentage}%`,
            formatNumber(ind.target_value),
            ind.measurement_unit || '-'
          ])

          const { data: subs } = await adminClient
            .from('m_kpi_sub_indicators')
            .select('*')
            .eq('indicator_id', ind.id)
            .eq('is_active', true)
            .order('code')

          for (const sub of subs || []) {
            const scoringInfo = formatSubIndicatorScoringInfo(sub)
            const subDesc = sub.description ? `\n  Deskripsi: ${sub.description}` : ''

            tableBody.push([
              `  ${sub.code}`,
              `  ${sub.name}${subDesc}${scoringInfo}`,
              `${sub.weight_percentage}%`,
              formatNumber(sub.target_value),
              sub.measurement_unit || '-'
            ])
          }
        }

        autoTable(doc, {
          startY: currentY,
          head: [['Kode', 'Indikator / Sub-Indikator & Petunjuk', 'Bobot', 'Target', 'Satuan']],
          body: tableBody,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [44, 62, 80] },
          margin: { left: 20, right: 20 }
        })

        currentY = (doc as any).lastAutoTable.finalY + 12
        if (currentY > 250) {
          doc.addPage()
          currentY = 20
        }
      }
    }
  }

  await addPdfFooters(doc, footerText)

  return Buffer.from(doc.output('arraybuffer'))
}
