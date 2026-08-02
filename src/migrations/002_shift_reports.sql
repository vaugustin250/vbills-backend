CREATE TABLE IF NOT EXISTS shift_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  watchman_name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  vehicles_in INT DEFAULT 0,
  vehicles_out INT DEFAULT 0,
  revenue_cash NUMERIC(10,2) DEFAULT 0.00,
  revenue_upi NUMERIC(10,2) DEFAULT 0.00,
  revenue_total NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super Admins can see all shift reports" ON shift_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
);
CREATE POLICY "Managers can see their own tenant shift reports" ON shift_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND users.tenant_id = shift_reports.tenant_id AND role = 'MANAGER')
);
CREATE POLICY "Watchmen can insert shift reports" ON shift_reports FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND users.tenant_id = shift_reports.tenant_id AND role = 'WATCHMAN')
);
