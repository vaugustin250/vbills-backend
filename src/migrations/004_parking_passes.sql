CREATE TABLE IF NOT EXISTS parking_passes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pass_number TEXT NOT NULL,
  pass_type TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  phone TEXT,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  max_entries INTEGER,
  price_charged NUMERIC,
  qr_code TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passes_tenant ON parking_passes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_passes_vehicle ON parking_passes(vehicle_number);
