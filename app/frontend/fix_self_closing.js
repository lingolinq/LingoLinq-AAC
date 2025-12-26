#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

// Get all .hbs files
const templatesDir = process.argv[2] || 'app/templates';
const files = execSync(`find ${templatesDir} -name "*.hbs"`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(f => f);

console.log(`Found ${files.length} template files`);

let totalChanges = 0;
let filesChanged = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  let newContent = content;
  let changes = 0;
  
  // Fix self-closing void elements
  // List of void elements that should never be self-closing
  const voidElements = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ];
  
  voidElements.forEach(element => {
    // Match <element with any attributes /> and replace with <element with attributes>
    const regex = new RegExp(`<${element}([^>]*?)\\/\\s*>`, 'gi');
    const matches = newContent.match(regex);
    if (matches) {
      newContent = newContent.replace(regex, `<${element}$1>`);
      changes += matches.length;
    }
  });
  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`Fixed ${changes} self-closing elements in ${file}`);
    filesChanged++;
    totalChanges += changes;
  }
});

console.log(`\nTotal: Fixed ${totalChanges} self-closing elements in ${filesChanged} files`);
