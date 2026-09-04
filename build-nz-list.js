/**
 * New Zealand Healthcare & Human Services Charity Finder
 * Uses Charities Services' live OData API (free, no key, no download needed).
 *
 * Approach:
 * 1. Pull all organisations linked to Activity #9 "Provides services (e.g.
 *    care / counselling)" - a real structured category with broad coverage.
 * 2. Supplement with direct name-based searches against all organisations,
 *    since NZ's "Other - ..." activity entries turned out to be individual
 *    charities' own free-text descriptions, not a proper linked category
 *    (querying them returned 0 results - not usable for bulk fetching).
 *
 * Setup:
 * 1. Run: npm install axios   (skip if already installed in this folder)
 * 2. Run: node build-nz-list.js
 *
 * Output: results-nz.csv
 *
 * No API key needed - this is a fully open public API.
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://www.odata.charities.govt.nz';

const KEYWORD_PATTERN = /health|hospital|mental|psychiat|psycholog|counsel|therap|clinic|wellness|wellbeing|well-being|crisis|addiction|substance|social work|social service|disability|nursing|medical|rehabilitation|rehab/i;

// Keywords searched individually against organisation names via the API
const NAME_SEARCH_TERMS = [
  'health', 'hospital', 'mental', 'psychiatric', 'psychology', 'counsel',
  'therapy', 'clinic', 'wellness', 'wellbeing', 'crisis', 'addiction',
  'disability', 'nursing', 'medical', 'rehabilitation', 'rehab'
];

// Handles the actual response shape confirmed live: {"d": [ {...}, {...} ]}
function extractArray(data) {
  if (Array.isArray(data?.d)) return data.d;
  if (Array.isArray(data?.d?.results)) return data.d.results;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data)) return data;
  return [];
}

async function fetchOrganisationsForActivity(activityId) {
  const results = [];
  try {
    const res = await axios.get(`${BASE_URL}/Activities(${activityId})/Organisations`, {
      params: { $format: 'json', $returnall: 'true' },
      headers: { Accept: 'application/json' }
    });
    results.push(...extractArray(res.data));
  } catch (err) {
    console.error(`  Error fetching organisations for activity ${activityId}:`, err.message);
  }
  return results;
}

async function searchOrganisationsByName(keyword) {
  const results = [];
  try {
    const res = await axios.get(`${BASE_URL}/Organisations`, {
      params: {
        $format: 'json',
        $returnall: 'true',
        $filter: `substringof('${keyword}', tolower(Name)) eq true`
      },
      headers: { Accept: 'application/json' }
    });
    results.push(...extractArray(res.data));
  } catch (err) {
    console.error(`  Error searching name for "${keyword}":`, err.message);
  }
  return results;
}

function addToSeen(seen, orgs) {
  let added = 0;
  for (const org of orgs) {
    const regNumber = org.CharityRegistrationNumber;
    if (!regNumber || seen.has(regNumber)) continue;

    // Skip deregistered/inactive charities - not useful for outreach
    const status = org.RegistrationStatus || '';
    if (status.toLowerCase() !== 'registered') continue;

    seen.set(regNumber, {
      name: org.Name || '',
      registrationNumber: regNumber,
      address: org.PostalAddressLine1 || org.StreetAddressLine1 || '',
      city: org.PostalAddressCity || org.StreetAddressCity || '',
      postcode: org.PostalAddressPostcode || org.StreetAddressPostcode || '',
      website: org.WebSiteURL || '',
      status
    });
    added++;
  }
  return added;
}

async function main() {
  const seen = new Map();

  console.log('Step 1: Fetching organisations under "Provides services (e.g. care / counselling)" (Activity 9)...');
  const activityOrgs = await fetchOrganisationsForActivity(9);
  const added1 = addToSeen(seen, activityOrgs);
  console.log(`  Found ${activityOrgs.length} organisations, ${added1} new.\n`);

  console.log('Step 2: Searching organisation names for health-related keywords...');
  for (const term of NAME_SEARCH_TERMS) {
    const orgs = await searchOrganisationsByName(term.toLowerCase());
    const added = addToSeen(seen, orgs);
    console.log(`  "${term}": found ${orgs.length}, ${added} new`);
    await new Promise(r => setTimeout(r, 300));
  }

  const rows = Array.from(seen.values());
  console.log(`\nTotal unique organisations found: ${rows.length}`);

  const header = 'Name,Registration Number,Address,City,Postcode,Website,Status\n';
  const csv = header + rows.map(r =>
    `"${(r.name || '').replace(/"/g, '""')}","${r.registrationNumber}","${(r.address || '').replace(/"/g, '""')}","${(r.city || '').replace(/"/g, '""')}","${r.postcode}","${r.website}","${r.status}"`
  ).join('\n');

  fs.writeFileSync('results-nz.csv', csv);
  console.log('Saved to results-nz.csv');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
