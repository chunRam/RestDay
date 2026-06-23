const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const EXPECTED_PROJECT = 'restdady';
const EXPECTED_TARGETS = {
  app: 'restday',
  legacy: 'restdady',
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function fail(message) {
  console.error(`\n[deploy:check] ${message}\n`);
  process.exit(1);
}

const firebaseJson = readJson('firebase.json');
const firebaserc = readJson('.firebaserc');
const firebaseConfigSource = fs.readFileSync(
  path.join(root, 'src/firebase/config.ts'),
  'utf8'
);

const hostingEntries = Array.isArray(firebaseJson.hosting)
  ? firebaseJson.hosting
  : [firebaseJson.hosting];

if (!hostingEntries.length || hostingEntries.some((entry) => !entry || typeof entry !== 'object')) {
  fail('firebase.json must define hosting configuration entries.');
}

for (const entry of hostingEntries) {
  if ('site' in entry) {
    fail(
      'firebase.json must use "target" instead of "site" so the hosting site ID cannot be confused with the Firebase project ID.'
    );
  }

  if (!entry.target || !(entry.target in EXPECTED_TARGETS)) {
    fail(
      `firebase.json contains an unexpected hosting target "${entry.target ?? 'undefined'}".`
    );
  }
}

if (firebaserc.projects?.default !== EXPECTED_PROJECT) {
  fail(
    `.firebaserc default project must be "${EXPECTED_PROJECT}", found "${firebaserc.projects?.default ?? 'undefined'}".`
  );
}

for (const [target, site] of Object.entries(EXPECTED_TARGETS)) {
  const configuredSites = firebaserc.targets?.[EXPECTED_PROJECT]?.hosting?.[target];

  if (!Array.isArray(configuredSites) || !configuredSites.includes(site)) {
    fail(
      `.firebaserc must map hosting target "${target}" to site "${site}" inside project "${EXPECTED_PROJECT}".`
    );
  }
}

const projectIdMatch = firebaseConfigSource.match(/projectId:\s*"([^"]+)"/);
if (!projectIdMatch) {
  fail('Could not find projectId in src/firebase/config.ts.');
}

if (projectIdMatch[1] !== EXPECTED_PROJECT) {
  fail(
    `src/firebase/config.ts projectId must stay "${EXPECTED_PROJECT}", found "${projectIdMatch[1]}".`
  );
}

console.log(
  `[deploy:check] OK: project=${EXPECTED_PROJECT}, hosting targets=${Object.entries(EXPECTED_TARGETS)
    .map(([target, site]) => `${target}->${site}`)
    .join(', ')}`
);
