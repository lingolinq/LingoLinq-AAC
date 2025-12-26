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

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  let newContent = content;
  let changes = 0;
  
  // Strategy: Process the file character by character, tracking context
  // Only replace single quotes that are within Handlebars expressions
  // and not already inside strings
  
  let result = '';
  let i = 0;
  let inHandlebars = false;
  let handlebarsDepth = 0;
  let inDoubleQuote = false;
  let inSingleQuote = false;
  
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    
    // Track Handlebars context
    if (char === '{' && next === '{') {
      handlebarsDepth++;
      inHandlebars = true;
      result += char;
      i++;
      continue;
    }
    
    if (char === '}' && next === '}') {
      handlebarsDepth--;
      if (handlebarsDepth === 0) {
        inHandlebars = false;
      }
      result += char;
      i++;
      continue;
    }
    
    // Track quote context
    if (char === '"' && !inSingleQuote && content[i - 1] !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      i++;
      continue;
    }
    
    if (char === "'" && !inDoubleQuote && content[i - 1] !== '\\') {
      // Only replace if we're in a Handlebars expression
      if (inHandlebars) {
        result += '"';
        changes++;
      } else {
        result += char;
      }
      i++;
      continue;
    }
    
    result += char;
    i++;
  }
  
  if (changes > 0) {
    fs.writeFileSync(file, result, 'utf-8');
    console.log(`Fixed ${changes} quotes in ${file}`);
    totalChanges += changes;
  }
});

console.log(`\nTotal: Fixed ${totalChanges} single quotes across ${files.length} files`);
