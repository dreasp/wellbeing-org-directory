/**
 * Canada Healthcare & Human Services Charity Finder
 * Joins three CRA open-data files by BN (Business Number):
 *   - ident_2023_updated.csv        (name, address, category)
 *   - weburl_2023_updated.csv       (website, if the charity provided one)
 *   - new_ongoing_programs_2023_updated.csv (free-text program descriptions)
 *
 * Since this is CRA's registered CHARITY database, government bodies are
 * already excluded by definition (they can't register as charities) - so
 * unlike the UK, we don't need a separate public-body filter here.
 *
 * Filters to charities whose sub-category or program description suggests
 * health, mental health, hospital, or social-service activity.
 *
 * Setup:
 * 1. Run: npm install csv-parse
 * 2. Make sure all 3 CSVs are in this folder
 * 3. Run: node build-canada-list.js
 *
 * Output: results-canada.csv
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const IDENT_FILE = 'ident_2023_updated.csv';
const WEBURL_FILE = 'weburl_2023_updated.csv';
const PROGRAMS_FILE = 'new_ongoing_programs_2023_updated.csv';

// Keywords checked against sub-category, legal name, and program descriptions
const RELEVANT_PATTERN = /\b(health|hospital|mental|psychiatric|psycholog|counsel|therapy|therapeutic|clinic|wellness|wellbeing|well-being|crisis|addiction|substance|social work|social service|disability|nursing|medical|rehabilitation|rehab)\b/i;

function loadCsv(filename) {
  console.log(`Reading ${filename}...`);
  const text = fs.readFileSync(filename, 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function main() {
  for (const f of [IDENT_FILE, WEBURL_FILE, PROGRAMS_FILE]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing file: ${f}. Make sure all 3 CSVs are in this folder.`);
      process.exit(1);
    }
  }

  const identRows = loadCsv(IDENT_FILE);
  const weburlRows = loadCsv(WEBURL_FILE);
  const programRows = loadCsv(PROGRAMS_FILE);

  console.log(`Loaded ${identRows.length} identification records, ${weburlRows.length} website records, ${programRows.length} program records.\n`);

  // Build website lookup - a charity can have multiple URLs, keep the first
  const websiteByBn = new Map();
  for (const row of weburlRows) {
    const bn = (row['BN/NE'] || '').trim();
    const url = (row['Contact URL'] || '').trim();
    if (bn && url && !websiteByBn.has(bn)) {
      websiteByBn.set(bn, url);
    }
  }

  // Build program description lookup - concatenate all program desc columns
  const programByBn = new Map();
  for (const row of programRows) {
    const bn = (row['BN'] || '').trim();
    const descs = [row['Program #1 Desc'], row['Program #2 Desc'], row['Program #3 Desc']]
      .filter(Boolean)
      .join(' ');
    if (bn && descs) {
      const existing = programByBn.get(bn) || '';
      programByBn.set(bn, existing + ' ' + descs);
    }
  }

  const results = [];

  for (const row of identRows) {
    const bn = (row['BN'] || '').trim();
    if (!bn) continue;

    const name = row['Legal Name'] || row['Account Name'] || '';
    const subCategory = row['Sub Category'] || '';
    const programDesc = programByBn.get(bn) || '';

    const combined = `${name} ${subCategory} ${programDesc}`;
    if (!RELEVANT_PATTERN.test(combined)) continue;

    results.push({
      name,
      bn,
      category: row['Category'] || '',
      subCategory,
      designation: row['Designation'] || '',
      address: [row['Address Line 1'], row['Address Line 2']].filter(Boolean).join(', '),
      city: row['City'] || '',
      province: row['Province'] || '',
      postalCode: row['Postal Code'] || '',
      website: websiteByBn.get(bn) || ''
    });
  }

  console.log(`Total relevant charities found: ${results.length}`);

  const header = 'Name,BN,Category,Sub Category,Designation,Address,City,Province,Postal Code,Website\n';
  const csv = header + results.map(r =>
    `"${r.name.replace(/"/g, '""')}","${r.bn}","${r.category.replace(/"/g, '""')}","${r.subCategory.replace(/"/g, '""')}","${r.designation.replace(/"/g, '""')}","${r.address.replace(/"/g, '""')}","${r.city.replace(/"/g, '""')}","${r.province}","${r.postalCode}","${r.website}"`
  ).join('\n');

  fs.writeFileSync('results-canada.csv', csv);
  console.log('Saved to results-canada.csv');
}

main();
