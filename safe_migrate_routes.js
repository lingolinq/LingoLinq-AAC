const fs = require('fs');
const path = require('path');

const routesDir = 'app/frontend/app/routes';

// Helper to check if file needs migration
function needsMigration(content) {
  return content.includes("import app_state from '../utils/app_state'") || 
         content.includes("import persistence from '../utils/persistence'") ||
         content.includes("import modal from '../utils/modal'") ||
         content.includes("import stashes from '../utils/_stashes'");
}

// Function to process a single file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (!needsMigration(content)) {
    return;
  }

  console.log(`Migrating ${filePath}...`);

  // 1. Add Service Import
  if (!content.includes("@ember/service")) {
    content = content.replace(
      /import Route from '@ember\/routing\/route';/,
      "import Route from '@ember/routing/route';\nimport { inject as service } from '@ember/service';"
    );
  }

  // 2. Identify needed services
  const needsAppState = content.includes('app_state.') || content.includes('appState');
  const needsPersistence = content.includes('persistence.');
  const needsStashes = content.includes('stashes.') || content.includes('_stashes.');
  const needsModal = content.includes('modal.') || content.includes('modal.setup(');

  // 3. Inject Services
  let injections = [];
  if (needsAppState && !content.includes('appState: service')) injections.push("  appState: service('app-state'),");
  if (needsPersistence && !content.includes('persistence: service')) injections.push("  persistence: service(),");
  if (needsStashes && !content.includes('stashes: service')) injections.push("  stashes: service(),");
  if (needsModal && !content.includes('modal: service')) injections.push("  modal: service(),");

  if (injections.length > 0) {
    const injectionString = '\n' + injections.join('\n');
    content = content.replace(/export default Route.extend\({/, `export default Route.extend({${injectionString}`);
  }

  // 4. Replace Usages
  // app_state -> this.appState
  content = content.replace(/app_state.get\(/g, 'this.appState.get(');
  content = content.replace(/app_state.set\(/g, 'this.appState.set(');
  content = content.replace(/app_state./g, 'this.appState.'); // Catch-all for other props

  // persistence -> this.persistence
  content = content.replace(/persistence./g, 'this.persistence.');

  // stashes -> this.stashes
  content = content.replace(/stashes./g, 'this.stashes.');

  // modal -> this.modal
  // Handle modal.open/close/error etc
  content = content.replace(/modal.open\(/g, 'this.modal.open(');
  content = content.replace(/modal.close\(/g, 'this.modal.close(');
  content = content.replace(/modal.error\(/g, 'this.modal.error(');
  
  // Remove deprecated modal.setup(this)
  content = content.replace(/\s*modal.setup(this);/g, '');
  content = content.replace(/\s*this.modal.setup(this);/g, '');

  // 5. Clean up imports (comment them out for now to be safe, or delete)
  // We'll delete them to be clean
  content = content.replace(/import app_state from '..\/utils\/app_state';\n?/g, '');
  content = content.replace(/import persistence from '..\/utils\/persistence';\n?/g, '');
  content = content.replace(/import modal from '..\/utils\/modal';\n?/g, '');
  content = content.replace(/import stashes from '..\/utils\/_stashes';\n?/g, '');

  // 6. Fix "this.this" just in case regex created it
  content = content.replace(/this.this./g, 'this.');

  fs.writeFileSync(filePath, content);
  console.log(`  ✓ Done: ${filePath}`);
}

// Walk function
function walk(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath);
    } else if (file.endsWith('.js')) {
      processFile(filePath);
    }
  });
}

walk(routesDir);
