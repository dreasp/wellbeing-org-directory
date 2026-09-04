/**
 * Import CSVs into the organizations database.
 *
 * Setup:
 * 1. Make sure .env has DATABASE_URL set
 * 2. Copy the relevant CSVs into this folder
 * 3. Run: node import-csv.js
 *
 * Usage:
 *   node import-csv.js              -> runs all countries (default)
 *   node import-csv.js --only=uk    -> runs only UK
 *   node import-csv.js --only=us,ca -> runs US and Canada
 * Accepted keys: uk, us, canada (or ca), australia (or au),
 *                newzealand (or nz), ireland (or ie)
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

async function importCanada() {
  const file = 'results-canada.csv';
  if (!fs.existsSync(file)) {
    console.log(`Skipping Canada import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Importing ${rows.length} Canada organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO organizations (name, country, city, region, address, website, category, registry_id, registry_source, status)
         VALUES ($1, 'Canada', $2, $3, $4, $5, $6, $7, 'CRA Charities', 'active')
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           city = COALESCE(EXCLUDED.city, organizations.city),
           region = COALESCE(EXCLUDED.region, organizations.region),
           address = COALESCE(EXCLUDED.address, organizations.address),
           website = COALESCE(organizations.website, EXCLUDED.website),
           category = COALESCE(EXCLUDED.category, organizations.category)`,
        [
          row.Name,
          row.City || '',
          row.Province || '',
          row.Address || '',
          normalizeWebsite(row.Website),
          row['Sub Category'] || row.Category || null,
          row.BN
        ]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} Canada organizations.\n`);
}

async function importAustralia() {
  const file = 'results-australia.csv';
  if (!fs.existsSync(file)) {
    console.log(`Skipping Australia import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Importing ${rows.length} Australia organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO organizations (name, country, city, region, address, website, category, registry_id, registry_source, status)
         VALUES ($1, 'Australia', $2, $3, $4, $5, $6, $7, 'ACNC', 'active')
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           city = COALESCE(EXCLUDED.city, organizations.city),
           region = COALESCE(EXCLUDED.region, organizations.region),
           address = COALESCE(EXCLUDED.address, organizations.address),
           website = COALESCE(organizations.website, EXCLUDED.website),
           category = COALESCE(EXCLUDED.category, organizations.category)`,
        [
          row.Name,
          row.City || '',
          row.State || '',
          row.Address || '',
          normalizeWebsite(row.Website),
          row.Category || null,
          row.ABN
        ]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} Australia organizations.\n`);
}

async function importNZ() {
  const file = 'results-nz.csv';
  if (!fs.existsSync(file)) {
    console.log(`Skipping New Zealand import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_records_with_error: true
  });
  console.log(`Importing ${rows.length} New Zealand organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO organizations (name, country, city, address, website, registry_id, registry_source, status)
         VALUES ($1, 'New Zealand', $2, $3, $4, $5, 'Charities Services', $6)
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           city = COALESCE(EXCLUDED.city, organizations.city),
           address = COALESCE(EXCLUDED.address, organizations.address),
           website = COALESCE(organizations.website, EXCLUDED.website)`,
        [
          row.Name,
          row.City || '',
          row.Address || '',
          normalizeWebsite(row.Website),
          row['Registration Number'],
          (row.Status || 'active').toLowerCase().includes('regist') ? 'active' : row.Status || 'active'
        ]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} New Zealand organizations.\n`);
}

async function importIreland() {
  const file = 'results-ireland.csv';
  if (!fs.existsSync(file)) {
    console.log(`Skipping Ireland import - ${file} not found in this folder.`);
    return;
  }

  const rows = parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
  console.log(`Importing ${rows.length} Ireland organizations from ${file}...`);

  let imported = 0;
  for (const row of rows) {
    try {
      // No website in Ireland's source data, so this only ever fills in a
      // website if you (or a future enrichment pass) add one manually later
      await pool.query(
        `INSERT INTO organizations (name, country, address, category, registry_id, registry_source, status)
         VALUES ($1, 'Ireland', $2, $3, $4, 'Charities Regulator', 'active')
         ON CONFLICT (name, country, registry_id) DO UPDATE SET
           address = COALESCE(EXCLUDED.address, organizations.address),
           category = COALESCE(EXCLUDED.category, organizations.category)`,
        [
          row.Name,
          row.Address || '',
          row.Classification || null,
          row['Charity Number']
        ]
      );
      imported++;
    } catch (err) {
      console.error(`  Error importing "${row.Name}":`, err.message);
    }
  }
  console.log(`  Imported/updated ${imported} Ireland organizations.\n`);
}

function normalizeWebsite(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function extractCity(address) {
  if (!address) return '';
  const parts = address.split(',').map(p => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

async function main() {
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const requested = onlyArg
    ? onlyArg.replace('--only=', '').split(',').map(s => s.trim().toLowerCase())
    : null;

  const shouldRun = (keys) => !requested || keys.some(k => requested.includes(k));

  if (shouldRun(['uk'])) await importUK();
  if (shouldRun(['us'])) await importUS();
  if (shouldRun(['canada', 'ca'])) await importCanada();
  if (shouldRun(['australia', 'au'])) await importAustralia();
  if (shouldRun(['newzealand', 'nz'])) await importNZ();
  if (shouldRun(['ireland', 'ie'])) await importIreland();

  const { rows } = await pool.query('SELECT country, COUNT(*) FROM organizations GROUP BY country ORDER BY country');
  console.log('Current database totals:');
  rows.forEach(r => console.log(`  ${r.country}: ${r.count}`));

  await pool.end();
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
