/**
 * US Healthcare & Human Services Org Finder
 * Searches ProPublica's Nonprofit Explorer using NTEE major category codes
 * instead of name keywords - catches hospitals and health systems regardless
 * of naming (e.g. "Kaiser Permanente Foundation" wouldn't match a "mental
 * health" keyword search, but it falls under NTEE major category 4 - Health).
 *
 * NTEE major categories used:
 *   4 = Health (includes hospitals, clinics, mental health, disease-specific)
 *   5 = Human Services (includes social work, crisis services)
 *
 * No API key required - this is a fully open public API.
 *
 * Setup:
 * 1. Run: npm install axios
 * 2. Run: node find-companies-us.js
 *
 * Output: results-us.csv
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://projects.propublica.org/nonprofits/api/v2';

// US states to search across, since results are capped per query
const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC'
];

const NTEE_CATEGORIES = { 4: 'Health', 5: 'Human Services' };

async function searchByNteeAndState(nteeCode, state) {
  const results = [];
  let page = 0;

  while (true) {
    try {
      const response = await axios.get(`${BASE_URL}/search.json`, {
        params: {
          'ntee[id]': nteeCode,
          'state[id]': state,
          page
        }
      });

      const items = response.data.organizations || [];
      if (items.length === 0) break;

      results.push(...items);
      page++;

      if (page >= (response.data.num_pages || 1)) break;
      if (page >= 15) break; // cap per state/category combo (25 results/page now)

      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`Error searching NTEE ${nteeCode} / ${state}:`, err.response?.data || err.message);
      break;
    }
  }

  return results;
}

async function main() {
  const seen = new Map();

  for (const [nteeCode, label] of Object.entries(NTEE_CATEGORIES)) {
    console.log(`\nSearching NTEE category ${nteeCode} (${label}) across all states...`);
    let categoryTotal = 0;

    for (const state of STATES) {
      const items = await searchByNteeAndState(nteeCode, state);
      let newCount = 0;

      for (const org of items) {
        if (!seen.has(org.ein)) {
          seen.set(org.ein, {
            name: org.name,
            ein: org.ein,
            city: org.city || '',
            state: org.state || state,
            ntee_code: org.ntee_code || '',
            category: label,
            subseccd: org.subseccd || '',
            latest_income: org.income_amount || 0
          });
          newCount++;
        }
      }
      categoryTotal += newCount;
      process.stdout.write(`  ${state}: +${newCount}  `);
    }
    console.log(`\n  Total new for ${label}: ${categoryTotal}`);
  }

  const rows = Array.from(seen.values());
  console.log(`\nTotal unique organizations found: ${rows.length}`);

  const header = 'Name,EIN,City,State,NTEE Code,Category,Subsection Code,Latest Income\n';
  const csv = header + rows.map(r =>
    `"${(r.name || '').replace(/"/g, '""')}","${r.ein}","${r.city.replace(/"/g, '""')}","${r.state}","${r.ntee_code}","${r.category}","${r.subseccd}","${r.latest_income}"`
  ).join('\n');

  fs.writeFileSync('results-us.csv', csv);
  console.log('Saved to results-us.csv');
}

main();
