-- Migration: Create store_deployments table for tracking live deployment status
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS store_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT 'trends',
  status TEXT NOT NULL CHECK (status IN ('deploying', 'in_process', 'live', 'failed')),

  -- Timestamps
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  live_at TIMESTAMPTZ,  -- Set after 10 minutes or manual verification

  -- Version and deployment info
  version TEXT,  -- Optional version identifier (e.g., 'v1.2.3' or timestamp)
  deployment_url TEXT,  -- URL to the live store

  -- Metadata from process3dzip request
  metadata JSONB DEFAULT '{}',  -- Stores noc_name, sap_name, zone, state, city, format, format_type

  -- Response from process3dzip API
  api_response JSONB,  -- Store full response from the API
  error_message TEXT,  -- Error message if deployment failed

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_deployments_store_id ON store_deployments(store_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON store_deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_deployed_at ON store_deployments(deployed_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_deployments_store_status ON store_deployments(store_id, status, deployed_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE store_deployments ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all deployments
CREATE POLICY "Allow authenticated users to read deployments"
  ON store_deployments
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert deployments
CREATE POLICY "Allow authenticated users to insert deployments"
  ON store_deployments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update their own deployments
CREATE POLICY "Allow authenticated users to update deployments"
  ON store_deployments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_store_deployments_updated_at
  BEFORE UPDATE ON store_deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE store_deployments IS 'Tracks deployment status and history for stores made live via process3dzip API';
COMMENT ON COLUMN store_deployments.status IS 'deploying: Just initiated | in_process: Waiting for 10 min | live: Confirmed live | failed: Deployment failed';
COMMENT ON COLUMN store_deployments.live_at IS 'Timestamp when status transitioned to live (after 10 min delay or manual verification)';
COMMENT ON COLUMN store_deployments.metadata IS 'Stores additional deployment metadata (noc_name, sap_name, zone, state, city, format, format_type)';
