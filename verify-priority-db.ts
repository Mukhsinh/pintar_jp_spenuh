import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
    const { data, error } = await supabase
        .from('t_kpi_assessments')
        .select(`
      id, score, realization_value, employee_id,
      m_kpi_indicators!inner (
        name, calculation_method
      )
    `)
        .eq('m_kpi_indicators.calculation_method', 'priority')

    if (error) console.error(error)
    console.log('Priority assessments:', data?.length)
    if (data?.length) {
        console.log(data.slice(0, 5))
    }
}

test()
