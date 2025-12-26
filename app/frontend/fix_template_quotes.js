#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all .hbs files
const templatesDir = process.argv[2] || 'app/templates';
const files = execSync(`find ${templatesDir} -name "*.hbs"`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(f => f);

console.log(`Found ${files.length} template files`);

let totalChanges = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  let newContent = content;
  let changes = 0;
  
  // Replace single quotes with double quotes in Handlebars expressions
  // Pattern: {{anything 'string'}} or {{anything key='value'}}
  newContent = newContent.replace(
    /(\{\{[^}]*?)('([^']*)')([ }])/g,
    (match, before, quoted, inner, after) => {
      changes++;
      // Escape any double quotes in the inner content
      const escaped = inner.replace(/"/g, '\\"');
      return before + '"' + escaped + '"' + after;
    }
  );

  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`Fixed ${changes} quotes in ${file}`);
    totalChanges += changes;
  }
});

console.log(`\nTotal: Fixed ${totalChanges} single quotes across ${files.length} files`);
