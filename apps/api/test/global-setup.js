// Fresh migrated + seeded database before the API e2e run (E2E_SKIP_RESET=1 keeps it).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'reset-db.mjs')], { stdio: 'inherit' });
};
