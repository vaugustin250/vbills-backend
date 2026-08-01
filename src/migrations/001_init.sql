-- ============================================================
-- VBills Backend — PostgreSQL Database Schema
-- Version 1.0 | Supports 50+ years of data with partitioning
-- Run this ONCE on a fresh PostgreSQL database
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS (one per parking business / company)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  owner_name TEXT,
  logo_url TEXT,
  license_status TEXT NOT NULL DEFAULT 'TRIAL', -- TRIAL | ACTIVE | EXPIRED | SUSPENDED
  license_expires_at TIMESTAMPTZ,
  renewal_end TIMESTAMPTZ,
  feature_anpr BOOLEAN DEFAULT FALSE,
  feature_qr BOOLEAN DEFAULT TRUE,
  zones_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'WATCHMAN', -- SUPER_ADMIN | MANAGER | WATCHMAN
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ============================================================
-- SETTINGS (per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT 'My Parking',
  address TEXT,
  phone TEXT,
  email TEXT,
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  total_slots INTEGER NOT NULL DEFAULT 50,
  grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  gst_percent REAL NOT NULL DEFAULT 0,
  receipt_footer TEXT DEFAULT 'Thank you for using VBills!',
  upi_id TEXT,
  upi_phone TEXT,
  upi_qr_url TEXT,
  upi_payee_name TEXT,
  -- Parking rates
  rate_two_wheeler_first REAL NOT NULL DEFAULT 20,
  rate_two_wheeler_per_hour REAL NOT NULL DEFAULT 10,
  rate_four_wheeler_first REAL NOT NULL DEFAULT 40,
  rate_four_wheeler_per_hour REAL NOT NULL DEFAULT 20,
  rate_heavy_first REAL NOT NULL DEFAULT 80,
  rate_heavy_per_hour REAL NOT NULL DEFAULT 40,
  -- Entry fees (collected upfront)
  entry_fee_two_wheeler REAL DEFAULT 0,
  entry_fee_four_wheeler REAL DEFAULT 0,
  entry_fee_heavy REAL DEFAULT 0,
  -- Feature flags
  collect_driver_details BOOLEAN DEFAULT FALSE,
  zones_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARKING ZONES (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  total_slots INTEGER NOT NULL DEFAULT 10,
  zone_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PARKING RECORDS — The core table
-- Partitioned by year for 50+ year longevity and performance
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_records (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT '2-Wheeler',
  driver_name TEXT,
  driver_phone TEXT,
  zone TEXT,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  amount_charged REAL DEFAULT 0,
  amount_paid_at_entry REAL DEFAULT 0,
  amount_paid_at_exit REAL DEFAULT 0,
  payment_method TEXT,               -- 'Cash' | 'UPI' (at exit)
  payment_method_at_entry TEXT,       -- 'Cash' | 'UPI' (at entry)
  slot_number TEXT,
  image_url TEXT,                    -- ANPR image reference
  synced_from_offline BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
) PARTITION BY RANGE (entry_time);

-- Create year partitions (add more each year as needed)
CREATE TABLE IF NOT EXISTS parking_records_2024 PARTITION OF parking_records
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS parking_records_2025 PARTITION OF parking_records
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS parking_records_2026 PARTITION OF parking_records
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS parking_records_2027 PARTITION OF parking_records
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE IF NOT EXISTS parking_records_2028 PARTITION OF parking_records
  FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
CREATE TABLE IF NOT EXISTS parking_records_2029 PARTITION OF parking_records
  FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');
CREATE TABLE IF NOT EXISTS parking_records_future PARTITION OF parking_records
  FOR VALUES FROM ('2030-01-01') TO ('2080-01-01');

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_pr_tenant_entry ON parking_records(tenant_id, entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_pr_vehicle ON parking_records(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_pr_active ON parking_records(tenant_id, exit_time) WHERE exit_time IS NULL;

-- ============================================================
-- STAFF / WATCHMEN (managed per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'WATCHMAN',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG — Track all critical actions for security
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  user_id UUID,
  action TEXT NOT NULL,       -- 'LOGIN', 'ENTRY', 'EXIT', 'SETTINGS_UPDATE', etc.
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
