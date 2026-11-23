/**
 * Apollo US Healthcare Company Finder
 * Searches Apollo for US healthcare and social assistance companies (NAICS 62),
 * one state and one size group at a time, so each result can be tagged with
 * its state and size group (Apollo's search does not return those per row).
 *
 * Each page of 100 companies costs about 1 Apollo credit.
 *
 * Examples:
 *   node build-apollo-list.js --check
 *   node build-apollo-list.js                       TEST: Texas, 11-50 employees, 1 page
 *   node build-apollo-list.js --hiring              same, only companies with active job postings
 *   node build-apollo-list.js --state=florida --pages=3
 *   node build-apollo-list.js --state=texas,florida --size=11-50,51-200
 *   node build-apollo-list.js --all-states --size=11-50 --max=40
 *
 * Results accumulate in one CSV per mode, so you can run it state by state.
 * For "district of columbia", put quotes around the whole argument in PowerShell.
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const API_KEY = process.env.APOLLO_API_KEY;
const BASE_URL = 'https://api.apollo.io/api/v1';

const args = process.argv.slice(2);
const HIRING = args.includes('--hiring');
const OUTPUT_FILE = HIRING ? 'apollo-us-hiring.csv' : 'apollo-us-all.csv';

// ===== SETTINGS YOU CAN CHANGE =====
// NAICS 62 = healthcare and social assistance (hospitals, clinics, nursing and
// residential care, social services). Apollo matches codes by prefix.
const NAICS_CODES = ['6211', '6213', '6214', '6216', '622', '623', '6241'];
const NOT_NAICS_CODES = ['51', '5415', '5416', '5417', '31-33', '813', '561', '524', '611', '6212'];
const NOT_KEYWORDS = ['staffing', 'recruiting', 'foundation', 'software', 'insurance'];

const ALL_STATES = [
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
    'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
    'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
    'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
    'wisconsin', 'wyoming', 'district of columbia'
];

// Apollo's smallest bracket is 1-10, so the lowest group here starts at 11.
const SIZE_GROUPS = [
    { label: '11-50', ranges: ['11,20', '21,50'] },
    { label: '51-200', ranges: ['51,100', '101,200'] },
    { label: '201-1000', ranges: ['201,500', '501,1000'] },
    { label: '1001+', ranges: ['1001,2000', '2001,5000', '5001,10000', '10001,1000000'] }
];

const PER_PAGE = 100;
const DELAY_MS = 1500;
const DEFAULT_MAX_PAGES = 20; // credit guard for one run, change with --max=N
// ===================================

const HEADERS = ['Name', 'Apollo ID', 'Website', 'Domain', 'LinkedIn', 'State', 'Size Group', 'NAICS', 'Revenue', 'Founded', 'Phone'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getArg(name) {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3).split(',').map((s) => s.trim()).filter(Boolean) : null;
}

function titleCase(s) {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function headers() {
    return {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Accept: 'application/json'
    };
}

function explainError(err) {
    const status = err.response && err.response.status;
    const body = err.response && err.response.data;
    console.error(
        `Apollo error${status ? ' ' + status : ''}:`,
        typeof body === 'string' ? body : JSON.stringify(body) || err.message
    );
    if (status === 401) console.error('The key was rejected. Check APOLLO_API_KEY in your .env file.');
    if (status === 403) console.error('The key is valid, but this account or plan cannot use this endpoint or filter.');
    if (status === 429) console.error('Rate limit reached. Wait a few minutes and run again.');
}

async function checkKey() {
    try {
        const res = await axios.get(`${BASE_URL}/users/api_profile`, { headers: headers() });
        console.log('Key works. Apollo answered with status', res.status);
    } catch (err) {
        explainError(err);
    }
}

async function searchPage(state, group, page) {
    const params = new URLSearchParams();
    params.append('organization_locations[]', state);
    group.ranges.forEach((r) => params.append('organization_num_employees_ranges[]', r));
    NAICS_CODES.forEach((c) => params.append('organization_naics_codes[]', c));
    NOT_NAICS_CODES.forEach((c) => params.append('not_organization_naics_codes[]', c));
    NOT_KEYWORDS.forEach((k) => params.append('q_not_organization_keyword_tags[]', k));
    if (HIRING) params.append('organization_num_jobs_range[min]', '1');
    params.append('page', String(page));
    params.append('per_page', String(PER_PAGE));
    const url = `${BASE_URL}/mixed_companies/search?${params.toString()}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await axios.post(url, {}, { headers: headers() });
            return res.data;
        } catch (err) {
            if (err.response && err.response.status === 429 && attempt === 1) {
                console.log('  Rate limited, waiting 60 seconds...');
                await sleep(60000);
                continue;
            }
            explainError(err);
            return null;
        }
    }
    return null;
}

function toRow(o, state, sizeLabel) {
    const domain = o.primary_domain || '';
    return {
        'Name': o.name || '',
        'Apollo ID': o.id || '',
        'Website': o.website_url || (domain ? `https://${domain}` : ''),
        'Domain': domain,
        'LinkedIn': o.linkedin_url || '',
        'State': titleCase(state),
        'Size Group': sizeLabel,
        'NAICS': (o.naics_codes || []).join(' '),
        'Revenue': o.organization_revenue_printed || '',
        'Founded': o.founded_year || '',
        'Phone': o.phone || (o.primary_phone && o.primary_phone.number) || ''
    };
}

function loadExisting() {
    const seen = new Map();
    if (!fs.existsSync(OUTPUT_FILE)) return seen;
    try {
        const rows = parse(fs.readFileSync(OUTPUT_FILE, 'utf8'), {
            columns: true,
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true
        });
        rows.forEach((r) => {
            if (r['Apollo ID']) seen.set(r['Apollo ID'], r);
        });
        console.log(`Loaded ${seen.size} companies already saved in ${OUTPUT_FILE}`);
    } catch (err) {
        console.error(`Could not read ${OUTPUT_FILE}, starting fresh:`, err.message);
    }
    return seen;
}

function writeCsv(seen) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = Array.from(seen.values()).map((r) => HEADERS.map((h) => esc(r[h])).join(','));
    try {
        fs.writeFileSync(OUTPUT_FILE, HEADERS.join(',') + '\n' + lines.join('\n'));
    } catch (err) {
        console.error(`Could not save ${OUTPUT_FILE}. If it is open in Excel, close it and run again.`);
    }
}

async function main() {
    if (!API_KEY) {
        console.error('APOLLO_API_KEY is missing from your .env file.');
        process.exit(1);
    }

    if (args.includes('--check')) {
        await checkKey();
        return;
    }

    const states = args.includes('--all-states')
        ? ALL_STATES
        : (getArg('state') || ['texas']).map((s) => s.toLowerCase());

    const sizeLabels = args.includes('--all-sizes')
        ? SIZE_GROUPS.map((g) => g.label)
        : (getArg('size') || ['11-50']);

    const sizes = sizeLabels.map((label) => {
        const group = SIZE_GROUPS.find((g) => g.label === label);
        if (!group) {
            console.error(`Unknown size "${label}". Choose from: ${SIZE_GROUPS.map((g) => g.label).join(', ')}`);
            process.exit(1);
        }
        return group;
    });

    const pagesPerSearch = parseInt((getArg('pages') || ['1'])[0], 10);
    const startPage = parseInt((getArg('start') || ['1'])[0], 10);
    const maxTotalPages = parseInt((getArg('max') || [String(DEFAULT_MAX_PAGES)])[0], 10);
    const plannedPages = Math.min(states.length * sizes.length * pagesPerSearch, maxTotalPages);

    console.log(`Mode: ${HIRING ? 'ONLY companies with active job postings' : 'all companies'}`);
    console.log(`States: ${states.length}, size groups: ${sizes.map((s) => s.label).join(', ')}, pages per search: ${pagesPerSearch}`);
    console.log(`This run can use up to ${plannedPages} credits (cap ${maxTotalPages}). Saving to ${OUTPUT_FILE}`);

    const seen = loadExisting();
    let pagesUsed = 0;
    let sampleSaved = false;
    let healthcareCoded = 0;
    let totalReturned = 0;

    outer:
    for (const state of states) {
        for (const group of sizes) {
            console.log(`\n${titleCase(state)}, ${group.label} employees`);

            for (let page = startPage; page <= pagesPerSearch; page++) {
                if (pagesUsed >= maxTotalPages) {
                    console.log('Reached the page limit, stopping to protect your credits.');
                    break outer;
                }

                const data = await searchPage(state, group, page);
                if (!data) {
                    writeCsv(seen);
                    console.log('Stopped because of the error above. Progress so far was saved.');
                    return;
                }
                pagesUsed++;

                const orgs = [...(data.organizations || []), ...(data.accounts || [])];
                const p = data.pagination || {};
                if (page === startPage) console.log(`  Apollo reports ${p.total_entries ?? 'unknown'} matches for this search`);

                if (!sampleSaved && orgs.length) {
                    fs.writeFileSync('apollo-sample.json', JSON.stringify({ pagination: p, firstTwo: orgs.slice(0, 2) }, null, 2));
                    sampleSaved = true;
                }

                let added = 0;
                for (const o of orgs) {
                    totalReturned++;
                    if ((o.naics_codes || []).some((c) => String(c).startsWith('62'))) healthcareCoded++;
                    if (!o.id || seen.has(o.id)) continue;
                    seen.set(o.id, toRow(o, state, group.label));
                    added++;
                }
                console.log(`  Page ${page}: ${orgs.length} returned, ${added} new`);

                if (orgs.length < PER_PAGE) break;
                if (p.total_pages && page >= p.total_pages) break;
                await sleep(DELAY_MS);
            }
            writeCsv(seen);
        }
    }

    writeCsv(seen);
    console.log(`\nDone. ${seen.size} companies in ${OUTPUT_FILE}, ${pagesUsed} pages used (about ${pagesUsed} credits).`);
    if (totalReturned) {
        console.log(`Sanity check: ${healthcareCoded} of ${totalReturned} returned companies carry a healthcare (62) NAICS code.`);
    }
}

main();