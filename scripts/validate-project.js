const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'package.json',
  'app.json',
  'app/_layout.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/photos.tsx',
  'app/review/index.tsx',
  'app/similar.tsx',
  'app/trash.tsx',
  'src/db/database.ts',
  'src/services/photoIndexer.ts',
  'src/services/aiService.ts',
  'README.md'
];

let failed = false;
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error('MISSING', file);
    failed = true;
  } else {
    console.log('OK', file);
  }
}

for (const file of ['package.json', 'app.json', 'eas.json', 'tsconfig.json']) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    console.log('JSON OK', file);
  } catch (error) {
    console.error('JSON INVALID', file, error.message);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('\nProject structure validation passed.');
