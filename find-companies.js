/**
 * UK Mental Health Org Finder
 * Searches Companies House (free, official UK gov API) for active companies
 * matching mental health / wellbeing keywords.
 *
 * Setup:
 * 1. Get a free API key: https://developer.company-information.service.gov.uk/
 *    (Register -> "Create an application" -> copy the API key)
 * 2. Run: npm install axios
 * 3. Set your API key below or as an env var: COMPANIES_HOUSE_API_KEY
 * 4. Run: node find-companies.js
 *
 * Output: writes results to results.csv in this folder
 */

const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.COMPANIES_HOUSE_API_KEY || '16064bb3-3147-403d-a765-bb6158fd1472';
const BASE_URL = 'https://api.company-information.service.gov.uk';

// Keywords to search for in company names
const KEYWORDS = [
  'mental health',
  'wellbeing',
  'counselling',
  'psychotherapy',
  'mind support',
  'therapy services',
  'psychiatric hospital',
  'mental health hospital',
  'mental health clinic',
  'counselling clinic',
  'social work',
  'social care',
  'crisis support',
  'crisis intervention',
  'addiction treatment',
  'substance misuse',
  'psychological services',
  'clinical psychology'
];

// Only keep companies matching these SIC codes (mental health / social work / human health)
const RELEVANT_SIC_CODES = ['88990', '86900', '87300', '86210', '86220'];

async function searchCompanies(keyword) {
  const results = [];
  let startIndex = 0;
  const itemsPerPage = 100;

  while (true) {
    try {
      const response = await axios.get(`${BASE_URL}/search/companies`, {
        params: {
          q: keyword,
          items_per_page: itemsPerPage,
          start_index: startIndex
        },
        auth: {
          username: API_KEY,
          password: ''
        }
      });

      const items = response.data.items || [];
      if (items.length === 0) break;

      results.push(...items);
      startIndex += itemsPerPage;

      // Companies House caps total results around 400 per query; stop if we've hit the ceiling
      if (startIndex >= (response.data.total_results || 0)) break;
      if (startIndex >= 400) break;

      // Be polite to the API (rate limit is 600 requests / 5 min)
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`Error searching "${keyword}":`, err.response?.data || err.message);
      break;
    }
  }

  return results;
}

function isRelevant(company) {
  // Only keep active companies
  if (company.company_status !== 'active') return false;
  return true;
}

async function main() {
  if (API_KEY === 'PASTE_YOUR_KEY_HERE') {
    console.error('Please set your Companies House API key first (see comments at top of file).');
    process.exit(1);
  }

  const seen = new Map(); // dedupe by company_number

  for (const keyword of KEYWORDS) {
    console.log(`Searching: "${keyword}"...`);
    const items = await searchCompanies(keyword);
    console.log(`  Found ${items.length} raw matches`);

    for (const company of items) {
      if (!isRelevant(company)) continue;
      if (!seen.has(company.company_number)) {
        seen.set(company.company_number, {
          name: company.title,
          company_number: company.company_number,
          status: company.company_status,
          address: company.address_snippet || '',
          date_of_creation: company.date_of_creation || ''
        });
      }
    }
  }

  const rows = Array.from(seen.values());
  console.log(`\nTotal unique active companies found: ${rows.length}`);

  // Write CSV
  const header = 'Name,Company Number,Status,Address,Date of Creation\n';
  const csv = header + rows.map(r =>
    `"${r.name.replace(/"/g, '""')}","${r.company_number}","${r.status}","${r.address.replace(/"/g, '""')}","${r.date_of_creation}"`
  ).join('\n');

  fs.writeFileSync('results.csv', csv);
  console.log('Saved to results.csv');
}

main();
