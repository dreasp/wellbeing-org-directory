/**
 * UK Healthcare & Social Services Org Finder
 * Searches Companies House using SIC codes (industry classification) instead
 * of name keywords - this catches hospitals, clinics, and care providers
 * regardless of what they're named (e.g. "Priory Group" wouldn't match a
 * "mental health" keyword search, but it will match SIC code 86101/87200).
 *
 * Setup:
 * 1. Get a free API key: https://developer.company-information.service.gov.uk/
 * 2. Run: npm install axios
 * 3. Set your API key below or as an env var: COMPANIES_HOUSE_API_KEY
 * 4. Run: node find-companies.js
 *
 * Output: results.csv in this folder
 */

const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.COMPANIES_HOUSE_API_KEY || '16064bb3-3147-403d-a765-bb6158fd1472';
const ADVANCED_SEARCH_URL = 'https://api.company-information.service.gov.uk/advanced-search/companies';

// SIC codes covering healthcare and social work broadly - not name-dependent
const SIC_CODES = {
  '86101': 'Hospital activities',
  '86102': 'Medical nursing home activities',
  '86210': 'General medical practice',
  '86220': 'Specialist medical practice',
  '86900': 'Other human health activities',
  '87100': 'Residential nursing care',
  '87200': 'Residential care - learning difficulties/mental health/substance abuse',
  '87300': 'Residential care - elderly and disabled',
  '87900': 'Other residential care',
  '88100': 'Social work without accommodation - elderly/disabled',
  '88990': 'Other social work without accommodation'
};

async function searchBySicCode(sicCode) {
  const results = [];
  let startIndex = 0;
  const size = 100;

  while (true) {
    try {
      const response = await axios.get(ADVANCED_SEARCH_URL, {
        params: {
          sic_codes: sicCode,
          company_status: 'active',
          size,
          start_index: startIndex
        },
        auth: { username: API_KEY, password: '' }
      });

      const items = response.data.items || [];
      if (items.length === 0) break;

      results.push(...items);
      startIndex += size;

      if (startIndex >= (response.data.hits || 0)) break;
      if (startIndex >= 3000) break; // reasonable cap per SIC code

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`Error searching SIC ${sicCode}:`, err.response?.data?.error || err.message);
      break;
    }
  }

  return results;
}

async function main() {
  if (API_KEY === 'PASTE_YOUR_KEY_HERE') {
    console.error('Please set your Companies House API key first (see comments at top of file).');
    process.exit(1);
  }

  const seen = new Map();

  for (const [code, label] of Object.entries(SIC_CODES)) {
    console.log(`Searching SIC ${code} (${label})...`);
    const items = await searchBySicCode(code);
    console.log(`  Found ${items.length} companies`);

    for (const company of items) {
      const number = company.company_number;
      if (!seen.has(number)) {
        seen.set(number, {
          name: company.company_name || company.title,
          company_number: number,
          status: company.company_status || 'active',
          address: formatAddress(company.registered_office_address),
          sic_code: code,
          sic_label: label,
          date_of_creation: company.date_of_creation || ''
        });
      }
    }
  }

  const rows = Array.from(seen.values());
  console.log(`\nTotal unique active organizations found: ${rows.length}`);

  const header = 'Name,Company Number,Status,Address,SIC Code,Category,Date of Creation\n';
  const csv = header + rows.map(r =>
    `"${(r.name || '').replace(/"/g, '""')}","${r.company_number}","${r.status}","${r.address.replace(/"/g, '""')}","${r.sic_code}","${r.sic_label}","${r.date_of_creation}"`
  ).join('\n');

  fs.writeFileSync('results.csv', csv);
  console.log('Saved to results.csv');
}

function formatAddress(addr) {
  if (!addr) return '';
  return [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
    .filter(Boolean)
    .join(', ');
}

main();
