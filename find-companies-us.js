/**
 * US Mental Health Org Finder
 * Searches ProPublica's Nonprofit Explorer API (free, no key required) for
 * US-registered nonprofits related to mental health.
 *
 * Setup:
 * 1. Run: npm install axios
 * 2. Run: node find-companies-us.js
 *
 * Output: results-us.csv
 *
 * No API key needed - this is a fully open public API.
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://projects.propublica.org/nonprofits/api/v2';

// Keywords to search for in org name/city
const KEYWORDS = [
  'mental health',
  'behavioral health',
  'counseling',
  'psychiatric',
  'wellbeing',
  'wellness',
  'psychotherapy',
  'psychiatric hospital',
  'behavioral health hospital',
  'mental health clinic',
  'counseling clinic',
  'clinical social work',
  'social services',
  'social work agency',
  'crisis center',
  'crisis intervention',
  'addiction treatment',
  'substance abuse treatment',
  'therapy center',
  'psychological services'
];

// NTEE codes for mental health / crisis intervention categories (IRS classification)
// F20-F99 = Mental Health, Crisis Intervention
const RELEVANT_NTEE_PREFIX = 'F';

async function searchOrgs(keyword, page = 0) {
  try {
    const response = await axios.get(`${BASE_URL}/search.json`, {
      params: { q: keyword, page }
    });
    return response.data;
  } catch (err) {
    console.error(`Error searching "${keyword}" page ${page}:`, err.response?.data || err.message);
    return null;
  }
}

function isRelevant(org) {
  // Keep active-looking orgs (ProPublica doesn't have a clean "active" flag like
  // Companies House, so we filter by NTEE code where available, otherwise keep)
  if (org.ntee_code && !org.ntee_code.startsWith(RELEVANT_NTEE_PREFIX)) {
    // Still keep it if the name obviously matches - NTEE codes aren't always
    // filled in consistently, so don't over-filter on this alone
    return true;
  }
  return true;
}

async function main() {
  const seen = new Map(); // dedupe by ein (Employer Identification Number)

  for (const keyword of KEYWORDS) {
    console.log(`Searching: "${keyword}"...`);
    let page = 0;
    let totalPages = 1;
    let foundThisKeyword = 0;

    while (page < totalPages) {
      const data = await searchOrgs(keyword, page);
      if (!data || !data.organizations) break;

      totalPages = data.num_pages || 1;

      for (const org of data.organizations) {
        if (!isRelevant(org)) continue;
        if (!seen.has(org.ein)) {
          seen.set(org.ein, {
            name: org.name,
            ein: org.ein,
            city: org.city || '',
            state: org.state || '',
            ntee_code: org.ntee_code || '',
            subseccd: org.subseccd || '',
            latest_income: org.income_amount || ''
          });
          foundThisKeyword++;
        }
      }

      page++;
      // Cap at 10 pages per keyword (1000 results) to keep this reasonable
      if (page >= 10) break;
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`  Found ${foundThisKeyword} new unique orgs`);
  }

  const rows = Array.from(seen.values());
  console.log(`\nTotal unique organizations found: ${rows.length}`);

  const header = 'Name,EIN,City,State,NTEE Code,Subsection Code,Latest Income\n';
  const csv = header + rows.map(r =>
    `"${(r.name || '').replace(/"/g, '""')}","${r.ein}","${r.city.replace(/"/g, '""')}","${r.state}","${r.ntee_code}","${r.subseccd}","${r.latest_income}"`
  ).join('\n');

  fs.writeFileSync('results-us.csv', csv);
  console.log('Saved to results-us.csv');
}

main();
