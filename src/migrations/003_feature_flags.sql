-- Add feature toggles for super admin control over tenant features
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_passes_allowed BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_zones_allowed BOOLEAN DEFAULT FALSE;
