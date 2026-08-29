const fs = require('fs');
const path = require('path');

for (const dir of ['.expo', 'dist']) {
  const target = path.join(process.cwd(), dir);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}
console.log('Cleaned generated folders.');
