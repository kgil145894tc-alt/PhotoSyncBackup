const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'catalog-archives.verify.sql'), 'utf8');
let migration = fs.readFileSync(path.join(root, 'docs/supabase-catalog-legacy-deletions.sql'), 'utf8');
// Test the canonical migration against temporary copies in the fixture's one
// rollback transaction; never run its production table references or commit.
migration = migration.replace(/^(begin|commit);\r?$/gm, '');
for (const table of ['services', 'packages', 'audit_logs', 'bookings']) {
  migration = migration.replaceAll('public.' + table, 'pg_temp.' + table + '_archive_probe');
}
if (migration.includes('public.') || /\bcommit\s*;/i.test(migration)) throw new Error('Unsafe fixture migration');
const output = path.join(root, '.codex-catalog-archives.verify.sql');
fs.writeFileSync(output, fixture.replace('-- LEGACY_MIGRATION_HERE', migration));
console.log(output);
