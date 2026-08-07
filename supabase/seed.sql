-- ============================================
-- SEED DATA FOR TESTING
-- ============================================

-- Insert Units
INSERT INTO m_units (code, name, proportion_percentage) VALUES
('IT', 'Information Technology', 25.00),
('SALES', 'Sales & Marketing', 30.00),
('FIN', 'Finance & Accounting', 20.00),
('HR', 'Human Resources', 15.00),
('OPS', 'Operations', 10.00)
ON CONFLICT (code) DO NOTHING;

-- Insert Employees (Note: Update email to match your Supabase Auth users)
INSERT INTO m_employees (employee_code, full_name, unit_id, role, email, tax_status) VALUES
-- Superadmin
('SA001', 'Admin System', (SELECT id FROM m_units WHERE code = 'IT'), 'superadmin', 'admin@example.com', 'TK/0'),

-- IT Unit
('IT001', 'John Doe', (SELECT id FROM m_units WHERE code = 'IT'), 'unit_manager', 'john.doe@example.com', 'K/1'),
('IT002', 'Jane Smith', (SELECT id FROM m_units WHERE code = 'IT'), 'employee', 'jane.smith@example.com', 'TK/0'),
('IT003', 'Bob Wilson', (SELECT id FROM m_units WHERE code = 'IT'), 'employee', 'bob.wilson@example.com', 'K/2'),

-- Sales Unit
('SLS001', 'Alice Johnson', (SELECT id FROM m_units WHERE code = 'SALES'), 'unit_manager', 'alice.johnson@example.com', 'K/1'),
('SLS002', 'Charlie Brown', (SELECT id FROM m_units WHERE code = 'SALES'), 'employee', 'charlie.brown@example.com', 'TK/1'),
('SLS003', 'Diana Prince', (SELECT id FROM m_units WHERE code = 'SALES'), 'employee', 'diana.prince@example.com', 'K/0'),

-- Finance Unit
('FIN001', 'Edward Norton', (SELECT id FROM m_units WHERE code = 'FIN'), 'unit_manager', 'edward.norton@example.com', 'K/2'),
('FIN002', 'Fiona Apple', (SELECT id FROM m_units WHERE code = 'FIN'), 'employee', 'fiona.apple@example.com', 'TK/0')
ON CONFLICT (employee_code) DO NOTHING;

-- Insert KPI Categories for IT Unit
INSERT INTO m_kpi_categories (unit_id, category, category_name, weight_percentage, description) VALUES
((SELECT id FROM m_units WHERE code = 'IT'), 'P1', 'Position Performance', 30.00, 'Kinerja berbasis job desk'),
((SELECT id FROM m_units WHERE code = 'IT'), 'P2', 'Output Performance', 50.00, 'Kinerja berbasis hasil/output'),
((SELECT id FROM m_units WHERE code = 'IT'), 'P3', 'Behavior & Competency', 20.00, 'Perilaku dan kompetensi')
ON CONFLICT (unit_id, category) DO NOTHING;

-- Insert KPI Indicators for IT Unit - P1
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P1'), 
 'P1-IT-01', 'Kehadiran', 100.00, 40.00, '%'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P1'), 
 'P1-IT-02', 'Ketepatan Waktu', 100.00, 30.00, '%'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P1'), 
 'P1-IT-03', 'Penyelesaian Tugas Rutin', 100.00, 30.00, '%')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert KPI Indicators for IT Unit - P2
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P2'), 
 'P2-IT-01', 'System Uptime', 99.50, 40.00, '%'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P2'), 
 'P2-IT-02', 'Ticket Resolution Time', 24.00, 30.00, 'hours'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P2'), 
 'P2-IT-03', 'Project Completion Rate', 100.00, 30.00, '%')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert KPI Indicators for IT Unit - P3
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P3'), 
 'P3-IT-01', 'Teamwork Score', 100.00, 50.00, 'score'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'IT') AND category = 'P3'), 
 'P3-IT-02', 'Innovation & Initiative', 100.00, 50.00, 'score')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert KPI Categories for Sales Unit
INSERT INTO m_kpi_categories (unit_id, category, category_name, weight_percentage, description) VALUES
((SELECT id FROM m_units WHERE code = 'SALES'), 'P1', 'Position Performance', 20.00, 'Kinerja berbasis job desk'),
((SELECT id FROM m_units WHERE code = 'SALES'), 'P2', 'Sales Achievement', 60.00, 'Pencapaian target penjualan'),
((SELECT id FROM m_units WHERE code = 'SALES'), 'P3', 'Customer Satisfaction', 20.00, 'Kepuasan pelanggan')
ON CONFLICT (unit_id, category) DO NOTHING;

-- Insert KPI Indicators for Sales Unit - P1
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'SALES') AND category = 'P1'), 
 'P1-SLS-01', 'Kehadiran', 100.00, 50.00, '%'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'SALES') AND category = 'P1'), 
 'P1-SLS-02', 'Report Submission', 100.00, 50.00, '%')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert KPI Indicators for Sales Unit - P2
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'SALES') AND category = 'P2'), 
 'P2-SLS-01', 'Revenue Target', 1000000000.00, 60.00, 'IDR'),
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'SALES') AND category = 'P2'), 
 'P2-SLS-02', 'New Customer Acquisition', 10.00, 40.00, 'customers')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert KPI Indicators for Sales Unit - P3
INSERT INTO m_kpi_indicators (category_id, code, name, target_value, weight_percentage, measurement_unit) VALUES
((SELECT id FROM m_kpi_categories WHERE unit_id = (SELECT id FROM m_units WHERE code = 'SALES') AND category = 'P3'), 
 'P3-SLS-01', 'Customer Satisfaction Score', 4.50, 100.00, 'score')
ON CONFLICT (category_id, code) DO NOTHING;

-- Insert Pool for current period (example: 2024-03)
INSERT INTO t_pool (period, revenue_total, deduction_total, global_allocation_percentage, status) VALUES
('2024-03', 500000000.00, 50000000.00, 80.00, 'draft')
ON CONFLICT (period) DO NOTHING;

-- Insert Pool Revenue Details
INSERT INTO t_pool_revenue (pool_id, description, amount) 
SELECT id, 'Pendapatan Operasional', 400000000.00 FROM t_pool WHERE period = '2024-03';

-- Insert Pool Deduction Details
INSERT INTO t_pool_deduction (pool_id, description, amount) 
SELECT id, 'Biaya Operasional', 30000000.00 FROM t_pool WHERE period = '2024-03';

-- Insert Sample Realizations for IT Employee (Jane Smith)
DO $$
DECLARE
  emp_id UUID;
  ind_id UUID;
BEGIN
  SELECT id INTO emp_id FROM m_employees WHERE employee_code = 'IT002';
  IF emp_id IS NOT NULL THEN
    -- P1 Indicators
    SELECT id INTO ind_id FROM m_kpi_indicators WHERE code = 'P1-IT-01';
    IF ind_id IS NOT NULL THEN
      INSERT INTO t_realization (employee_id, indicator_id, period, realization_value) 
      VALUES (emp_id, ind_id, '2024-03', 95.00);
    END IF;
    
    SELECT id INTO ind_id FROM m_kpi_indicators WHERE code = 'P1-IT-02';
    IF ind_id IS NOT NULL THEN
      INSERT INTO t_realization (employee_id, indicator_id, period, realization_value) 
      VALUES (emp_id, ind_id, '2024-03', 90.00);
    END IF;
  END IF;
END $$;
