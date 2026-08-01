-- Run this to add the missing columns to your live database
ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS ticket_no TEXT;
ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS operator_name TEXT;
