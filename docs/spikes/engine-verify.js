/* THROWAWAY verification — proves the new packer+overrides engine is BYTE-IDENTICAL
 * to today's dashboardLayout() across all 32 combos. Run: node docs/spikes/engine-verify.js */
const AREA = { boards:'boards', speak:'speak', extras:'extras', org:'org_mgmt', caseload:'caseload' };

// --- today (verbatim) ---
function todayLayout(vis){var cl=!!vis.caseload,sp=!!vis.speak,ex=!!vis.extras,og=!!vis.org,bd=!!vis.boards;var L=(a,r)=>({areas:a,rows:r});
if(!bd&&ex&&og){if(cl&&sp)return L(["caseload speak","extras org_mgmt",". sup"],"auto auto 0");if(cl)return L(["caseload caseload","extras org_mgmt",". sup"],"auto auto 0");if(sp)return L(["speak speak","extras org_mgmt",". sup"],"auto auto 0");return L(["extras org_mgmt",". sup"],"auto 0");}
if(!bd&&!sp&&!og&&ex&&cl)return L(["caseload extras",". sup"],"auto 0");
if(!bd&&!sp&&!ex&&og&&cl)return L(["caseload org_mgmt",". sup"],"auto 0");
if(!bd&&!ex&&!cl&&sp&&og)return L(["speak org_mgmt",". sup"],"auto 0");
if(!bd&&cl&&sp&&ex&&!og)return L(["caseload speak","extras extras",". sup"],"auto auto 0");
if(!bd&&cl&&sp&&!ex&&og)return L(["caseload speak","org_mgmt org_mgmt",". sup"],"auto auto 0");
if(bd){var o=[];if(cl)o.push("caseload");if(sp)o.push("speak");if(ex)o.push("extras");if(og)o.push("org");
if(o.length===0)return L(["boards boards",". sup"],"auto 0");
if(o.length===1)return L([AREA[o[0]]+" "+AREA[o[0]],"boards boards",". sup"],"auto auto 0");
if(o.length===2)return L([AREA[o[0]]+" "+AREA[o[1]],"boards boards",". sup"],"auto auto 0");}
if(bd&&cl&&sp&&og&&!ex)return L(["caseload speak","boards org_mgmt",". sup"],"auto auto 0");
if(!sp){if(cl&&og)return L(["caseload extras","boards org_mgmt",". sup"],"auto auto 0");if(cl)return L(["caseload caseload","boards extras",". sup"],"auto auto 0");if(og)return L(["boards extras","org_mgmt org_mgmt",". sup"],"auto auto 0");return L(["boards extras",". sup"],"auto 0");}
if(cl&&og)return L(["caseload speak","boards extras","boards org_mgmt",". sup"],"auto auto auto 0");
if(cl)return L(["caseload caseload","boards speak","boards extras",". sup"],"auto auto auto 0");
if(og)return L(["boards speak","boards extras","org_mgmt org_mgmt",". sup"],"auto auto auto 0");
return L(["boards speak","boards extras",". sup"],"auto auto 0");}

// --- NEW engine: registry-priority generic packer + explicit override table ---
const LAYOUT_PRIORITY = ['caseload','speak','extras','org']; // small-card fill order
const ORDER = ['caseload','speak','extras','org','boards'];  // canonical key order

// Bespoke arrangements the generic packer doesn't produce. Tagged so we know which
// are real design choices vs legacy quirks the old matrix emitted for sparse configs.
const CURATED = {
  // curated design: Extras+Org pair in a row; the lone higher-priority card spans on top
  'caseload+extras+org': ['caseload caseload','extras org_mgmt'],
  'speak+extras+org':    ['speak speak','extras org_mgmt'],
  // curated design: Boards is a TALL hero (2 rows) for these specific 3-small combos
  'caseload+speak+extras+boards': ['caseload caseload','boards speak','boards extras'],
  'speak+extras+org+boards':      ['boards speak','boards extras','org_mgmt org_mgmt'],
};
// LEGACY QUIRKS — the old matrix named hidden Boards/Extras areas for sparse configs
// (cells collapse via display:none). Reproduced for byte-parity; safe to drop later.
const LEGACY_QUIRK = {
  '':                ['boards extras'],
  'caseload':        ['caseload caseload','boards extras'],
  'speak':           ['boards speak','boards extras'],
  'caseload+speak':  ['caseload caseload','boards speak','boards extras'],
  'extras':          ['boards extras'],
  'speak+extras':    ['boards speak','boards extras'],
  'org':             ['boards extras','org_mgmt org_mgmt'],
};
const OVERRIDES = Object.assign({}, LEGACY_QUIRK, CURATED);

function packRows(vis){
  const A = k => AREA[k];
  const smalls = LAYOUT_PRIORITY.filter(k => vis[k]);
  if (vis.boards) {
    if (smalls.length === 0) return ['boards boards'];
    if (smalls.length === 1) return [`${A(smalls[0])} ${A(smalls[0])}`, 'boards boards'];
    if (smalls.length === 2) return [`${A(smalls[0])} ${A(smalls[1])}`, 'boards boards'];
    const rows = [`${A(smalls[0])} ${A(smalls[1])}`];
    for (let i = 2; i < smalls.length; i++) rows.push(`boards ${A(smalls[i])}`);
    return rows;
  }
  const rows = [];
  for (let i = 0; i < smalls.length; i += 2) {
    rows.push(i + 1 < smalls.length ? `${A(smalls[i])} ${A(smalls[i + 1])}` : `${A(smalls[i])} ${A(smalls[i])}`);
  }
  return rows;
}
function engine(vis){
  const key = ORDER.filter(k => vis[k]).join('+');
  const body = OVERRIDES[key] ? OVERRIDES[key].slice() : packRows(vis);
  const areas = body.concat(['. sup']);
  const rows = areas.map((_, i) => i === areas.length - 1 ? '0' : 'auto').join(' ');
  return { areas, rows };
}

// --- compare all 32 ---
let ok = 0, bad = 0;
for (let m = 0; m < 32; m++) {
  const vis = {}; ORDER.forEach((k, i) => vis[k] = !!(m & (1 << i)));
  const t = todayLayout(vis), e = engine(vis);
  const same = JSON.stringify(t.areas) === JSON.stringify(e.areas) && t.rows === e.rows;
  if (same) ok++; else {
    bad++;
    const on = ORDER.filter(k => vis[k]).join('+') || '(none)';
    console.log(`  ✗ ${on}\n      today : ${JSON.stringify(t.areas)} | ${t.rows}\n      engine: ${JSON.stringify(e.areas)} | ${e.rows}`);
  }
}
console.log(`\nENGINE PARITY: ${ok}/32 identical, ${bad} differ.`);
console.log(`(${Object.keys(LEGACY_QUIRK).length} legacy-quirk + ${Object.keys(CURATED).length} curated overrides; ${32 - Object.keys(OVERRIDES).length} via generic packer)\n`);
