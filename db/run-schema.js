/**
 * Runs db/schema.sql against your Supabase project.
 *
 * Usage:
 *   PAT=sbp_xxxx node db/run-schema.js
 *
 * Get a Personal Access Token (PAT) from:
 *   https://supabase.com/dashboard/account/tokens
 *
 * NOTE: The anon/service_role key will NOT work here.
 * You need a PAT (account-level token, starts with sbp_).
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_REF = 'guokfeyuysdecvtrrfcs';
const PAT = process.env.PAT || '';

if (!PAT) {
  console.error([
    '',
    'ERROR: No Personal Access Token found.',
    '',
    'Run with:',
    '  PAT=sbp_xxxx node db/run-schema.js',
    '',
    'Get a PAT at: https://supabase.com/dashboard/account/tokens',
    '',
  ].join('\n'));
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const body = JSON.stringify({ query: sql });

const options = {
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': 'Bearer ' + PAT,
  },
};

console.log('Sending schema.sql to Supabase project', PROJECT_REF, '...');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\nSchema applied successfully!');
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length) {
          console.log(JSON.stringify(parsed.slice(0, 5), null, 2));
        }
      } catch (_) {}
    } else {
      console.error('\nFailed — HTTP', res.statusCode);
      console.error(data.slice(0, 800));
      if (res.statusCode === 401) {
        console.error('\nMake sure you used a PAT (starts with sbp_), not the anon/service_role key.');
        console.error('Create one at: https://supabase.com/dashboard/account/tokens');
      }
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});

req.write(body);
req.end();
