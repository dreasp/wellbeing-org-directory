/**
 * Import existing CSVs into the organizations database.
 *
 * Setup:
 * 1. Create a .env file in this folder with:
 *    DATABASE_URL=your_neon_connection_string_here
 * 2. Run the schema.sql against your Neon database first (via Neon's SQL Editor)
 * 3. Copy your results.csv and results-us.csv into this folder
 * 4. Run: node import-csv.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function importUK() {
  const file = 'results.csv';

  if (!fs.existsSync(file)) {
    console.log(`Skipping UK import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Importing ${rows.length} UK organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      // COALESCE keeps the existing website/city if this row doesn't have one,
      // instead of overwriting good data with blanks on re-import
      await pool.query(
        `INSERT INTO organizations (name, country, city, address, category, registry_id, registry_source, status)
         VALUES ($1, 'UK', $2, $3, $4, $5, 'Companies House', $6)
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           address = COALESCE(EXCLUDED.address, organizations.address),
           category = COALESCE(EXCLUDED.category, organizations.category)`,
        [
          row.Name,
          extractCity(row.Address),
          row.Address || '',
          row.Category || row['SIC Code'] || null,
          row['Company Number'],
          row.Status || 'active'
        ]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} UK organizations.\n`);
}

async function importUS() {
  const file = 'results-us.csv';
  if (!fs.existsSync(file)) {
    console.log(`Skipping US import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Importing ${rows.length} US organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO organizations (name, country, city, region, category, registry_id, registry_source, status)
         VALUES ($1, 'US', $2, $3, $4, $5, 'ProPublica/IRS', 'active')
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           city = COALESCE(EXCLUDED.city, organizations.city),
           region = COALESCE(EXCLUDED.region, organizations.region),
           category = COALESCE(EXCLUDED.category, organizations.category)`,
        [row.Name, row.City || '', row.State || '', row.Category || row['NTEE Code'] || null, row.EIN]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} US organizations.\n`);
}

// Companies House addresses are one long string - grab a rough city guess
// from the second-to-last comma-separated segment (works for most UK addresses)
function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

async function main() {
  await importUK();
  await importUS();

  const { rows } = await pool.query('SELECT country, COUNT(*) FROM organizations GROUP BY country');
  console.log('Current database totals:');
  rows.forEach(r => console.log(`  ${r.country}: ${r.count}`));

  await pool.end();
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
