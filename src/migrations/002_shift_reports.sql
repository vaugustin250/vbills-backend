CREATE TABLE IF NOT EXISTS shift_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
