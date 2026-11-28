// Confirms the browser port (ptgen.js) builds exactly the files inside the two .obz packages.
//   node scripts/periodic_table/browser_import/check_port.js [--full-glyphs]
// Exit 0 means every file matches by SHA-256. Run it after any change to the Python generator,
// build_symbol_pack.py or ptgen.js, after make_bundle.py has refreshed expected.json.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const here = __dirname;
const ptBuild = require(path.join(here, 'ptgen.js'));
const full = process.argv.includes('--full-glyphs');
const G = JSON.parse(fs.readFileSync(full ? path.join(here, '..', 'atkinson_glyphs.json') : path.join(here, 'glyph_subset.json')));
const exp = JSON.parse(fs.readFileSync(path.join(here, 'expected.json')));
let total = 0;
for (const theme of Object.keys(exp)) {
  const files = ptBuild(theme, G), e = exp[theme], bad = [];
  for (const n of Object.keys(e.files)) {
    if (!(n in files)) { bad.push('missing ' + n); continue; }
    const h = crypto.createHash('sha256').update(Buffer.from(files[n], 'utf8')).digest('hex');
    if (h !== e.files[n]) bad.push(n);
  }
  for (const n of Object.keys(files)) if (!(n in e.files)) bad.push('extra ' + n);
  console.log(theme, 'entries', Object.keys(files).length, 'expected', e.count, 'mismatches', bad.length);
  if (bad.length) console.log(bad.slice(0, 8).join('\n'));
  total += bad.length;
}
process.exit(total ? 1 : 0);
