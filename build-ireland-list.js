/**
 * Ireland Healthcare & Social Services Charity Finder
 * Filters the Charities Regulator's public register CSV for health/mental
 * health/social service relevance, using the Classification and Purpose
 * text fields (richer signal than name alone).
 *
 * Setup:
 * 1. Make sure register-of-charities.csv is in this folder
 * 2. Run: npm install csv-parse   (should already be installed)
 * 3. Run: node build-ireland-list.js
 *
 * Output: results-ireland.csv
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const FILE = 'register-of-charities.csv';

const KEYWORD_PATTERN = /health|hospital|mental|psychiat|psycholog|counsel|therap|clinic|wellness|wellbeing|well-being|crisis|addiction|substance|social work|social service|disability|nursing|medical|rehabilitation|rehab/i;

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`Cannot find ${FILE}. Make sure it's in this folder.`);
    process.exit(1);
  }

  console.log(`Reading ${FILE}...`);
  const buffer = fs.readFileSync(FILE);

  // Detect UTF-16 encoding by BOM (common in Windows/Excel government exports).
  // Reading UTF-16 bytes as UTF-8 corrupts the text before parsing even
  // starts, which is almost certainly what caused the earlier 1,020,845
  // "rows" - each real character was being split into garbage characters
  // that looked like extra commas/newlines to the CSV parser.
  let text;
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    console.log('Detected UTF-16 LE encoding, converting...');
    text = buffer.toString('utf16le');
  } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    console.log('Detected UTF-16 BE encoding, converting...');
    text = buffer.swap16().toString('utf16le');
  } else {
    text = buffer.toString('utf8');
  }

  // Skip the stray title row ("Effective Date, Sunday 7 June 2026...")
  // before the real header row
  const firstNewlineIndex = text.indexOf('\n');
  const csvBody = text.slice(firstNewlineIndex + 1);

  const rows = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    skip_records_with_error: true
  });
  console.log(`Loaded ${rows.length} charities.\n`);

  if (rows.length > 20000) {
    console.warn('WARNING: Row count still looks too high for Ireland (~14,000 expected). Parsing may still be broken - check results carefully.\n');
  }

  const results = [];

  for (const row of rows) {
    const status = (row['Status'] || '').trim();
    if (status.toLowerCase() !== 'registered') continue;

    const name = row['Registered Charity Name'] || '';
    const classification = row['Charity Classification: Primary [Secondary (Sub)]'] || '';
    const purpose = row['Charitable Purpose'] || '';
    const objects = row['Charitable Objects'] || '';

    const combined = `${name} ${classification} ${purpose} ${objects}`;
    if (!KEYWORD_PATTERN.test(combined)) continue;

    results.push({
      name,
      charityNumber: row['Registered Charity Number'] || '',
      croNumber: row['CRO Number'] || '',
      address: row['Primary Address'] || '',
      classification,
      status
    });
  }

  console.log(`Total relevant charities found: ${results.length}`);

  const header = 'Name,Charity Number,CRO Number,Address,Classification,Status\n';
  const csv = header + results.map(r =>
    `"${r.name.replace(/"/g, '""')}","${r.charityNumber}","${r.croNumber}","${r.address.replace(/"/g, '""')}","${r.classification.replace(/"/g, '""')}","${r.status}"`
  ).join('\n');

  fs.writeFileSync('results-ireland.csv', csv);
  console.log('Saved to results-ireland.csv');
}

main();
