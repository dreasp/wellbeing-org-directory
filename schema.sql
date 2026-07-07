-- Run this once against your new Neon database to create the table.
-- You can do this via Neon's SQL Editor (in their web dashboard) - just
-- paste this whole file in and click Run.

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,              -- 'UK', 'US', 'Canada', 'Australia', 'New Zealand'
  category TEXT,                      -- 'mental health', 'psychiatric hospital', 'social work', etc.
  city TEXT,
  region TEXT,                        -- state/province/county
  address TEXT,
  website TEXT,
  registry_id TEXT,                   -- company number / EIN / charity number, whatever the source uses
  registry_source TEXT,               -- 'Companies House', 'ProPublica', 'CRA', etc.
  status TEXT,                        -- 'active', 'unknown', etc.
  date_added TIMESTAMP DEFAULT NOW(),
  UNIQUE(name, country, registry_id)  -- prevents duplicate imports
);

CREATE INDEX IF NOT EXISTS idx_org_country ON organizations(country);
CREATE INDEX IF NOT EXISTS idx_org_category ON organizations(category);
CREATE INDEX IF NOT EXISTS idx_org_name ON organizations(name);
CREATE INDEX IF NOT EXISTS idx_org_city ON organizations(city);
