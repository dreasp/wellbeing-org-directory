/**
 * Australia Healthcare & Human Services Charity Finder
 * Uses ACNC's single register CSV, which conveniently includes an official
 * "Advancing_Health" purpose flag and a Charity_Website column directly -
 * no keyword guessing or separate enrichment step needed.
 *
 * Setup:
 * 1. Run: npm install csv-parse   (skip if already installed in this folder)
 * 2. Make sure datadotgov_main.csv is in this folder
 * 3. Run: node build-australia-list.js
 *
 * Output: results-australia.csv
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const FILE = 'datadotgov_main.csv';

// Secondary keyword net for social-welfare charities that are health-adjacent
// but weren't tagged "Advancing_Health" (e.g. some disability/crisis orgs)
const KEYWORD_PATTERN = /\b(health|hospital|mental|psychiatric|psycholog|counsel|therapy|therapeutic|clinic|wellness|wellbeing|well-being|crisis|addiction|substance|social work|disability|nursing|medical|rehabilitation|rehab)\b/i;

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`Cannot find ${FILE}. Make sure it's in this folder.`);
    process.exit(1);
  }

  console.log(`Reading ${FILE}...`);
  const text = fs.readFileSync(FILE, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
  console.log(`Loaded ${rows.length} charities.\n`);

  const results = [];

  for (const row of rows) {
    const advancingHealth = (row['Advancing_Health'] || '').trim().toUpperCase() === 'Y';
    const socialWelfare = (row['Advancing_social_or_public_welfare'] || '').trim().toUpperCase() === 'Y';
    const disabilityFocus = (row['People_with_Disabilities'] || '').trim().toUpperCase() === 'Y';
    const chronicIllnessFocus = (row['People_with_Chronic_Illness'] || '').trim().toUpperCase() === 'Y';
    const name = row['Charity_Legal_Name'] || '';

    const nameMatches = KEYWORD_PATTERN.test(name);

    // Keep if officially tagged as health-advancing, OR tagged for
    // disability/chronic illness beneficiaries, OR social welfare + name match
    const isRelevant = advancingHealth || disabilityFocus || chronicIllnessFocus ||
                        (socialWelfare && nameMatches);

    if (!isRelevant) continue;

    results.push({
      name,
      abn: row['ABN'] || '',
      address: [row['Address_Line_1'], row['Address_Line_2']].filter(Boolean).join(', '),
      city: row['Town_City'] || '',
      state: row['State'] || '',
      postcode: row['Postcode'] || '',
      website: (row['Charity_Website'] || '').trim(),
      category: advancingHealth ? 'Health' : (disabilityFocus ? 'Disability' : (chronicIllnessFocus ? 'Chronic Illness' : 'Social Welfare')),
      charitySize: row['Charity_Size'] || ''
    });
  }

  console.log(`Total relevant charities found: ${results.length}`);

  const header = 'Name,ABN,Address,City,State,Postcode,Website,Category,Charity Size\n';
  const csv = header + results.map(r =>
    `"${r.name.replace(/"/g, '""')}","${r.abn}","${r.address.replace(/"/g, '""')}","${r.city.replace(/"/g, '""')}","${r.state}","${r.postcode}","${r.website}","${r.category}","${r.charitySize}"`
  ).join('\n');

  fs.writeFileSync('results-australia.csv', csv);
  console.log('Saved to results-australia.csv');
}

main();
