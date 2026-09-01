/**
 * Utility functions for KPI configuration exports (PDF & Excel).
 */

export function formatNumber(val: any): string {
    if (val === null || val === undefined || val === '') return '0'
    const num = Number(val)
    if (isNaN(num)) return String(val)
    return new Intl.NumberFormat('id-ID').format(num)
}

export function formatSubIndicatorScoringInfo(sub: any): string {
    if (sub.measurement_type === 'quantitative') {
        const qInfo: string[] = []
        if (sub.base_index_value !== null && sub.base_index_value !== undefined && sub.base_index_value !== '') {
            qInfo.push(`Tarif/Indeks: ${formatNumber(sub.base_index_value)}`)
        }
        if (sub.service_types && Array.isArray(sub.service_types) && sub.service_types.length > 0) {
            qInfo.push(`Layanan: ${sub.service_types.join(', ')}`)
        }
        return qInfo.length > 0 ? `\n  (Kuantitatif | ${qInfo.join(' | ')})` : '\n  (Kuantitatif)'
    }

    if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria) && sub.scoring_criteria.length > 0) {
        return (
            '\n  Kriteria Penilaian:\n' +
            sub.scoring_criteria
                .map((c: any) => `   • Skor ${formatNumber(c.score)}: ${c.label || ''}`)
                .join('\n')
        )
    }

    return ''
}

export function formatSubIndicatorExcelCriteria(sub: any): string {
    if (sub.measurement_type === 'quantitative') {
        let criteriaText = 'Kuantitatif'
        if (sub.service_types && Array.isArray(sub.service_types) && sub.service_types.length > 0) {
            criteriaText += ` (Layanan: ${sub.service_types.join(', ')})`
        }
        return criteriaText
    }

    if (sub.scoring_criteria && Array.isArray(sub.scoring_criteria) && sub.scoring_criteria.length > 0) {
        return sub.scoring_criteria
            .map((criteria: any) => `Skor ${formatNumber(criteria.score)}: ${criteria.label || 'N/A'}`)
            .join('\n')
    }

    return '-'
}
