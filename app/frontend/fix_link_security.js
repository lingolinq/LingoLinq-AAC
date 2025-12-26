#!/usr/bin/env node

const fs = require('fs');
const { execSync} = require('child_process');

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
  
  // Fix links with target="_blank" missing rel="noopener"
  // Pattern: <a ... target="_blank" ... > without rel="noopener"
  // We need to add rel="noopener" or append to existing rel
  
  // Match <a tags with target="_blank" but no rel attribute
  const regex1 = /<a\s+([^>]*?)target=["']_blank["']([^>]*?)(?<!rel=["'][^"']*["'])\s*>/gi;
  newContent = newContent.replace(regex1, (match, before, after) => {
    // Check if rel already exists somewhere in the tag
    if (match.includes('rel=')) {
      return match; // Skip, will handle in next regex
    }
    changes++;
    return `<a ${before}target="_blank"${after} rel="noopener">`;
  });
  
  // Match <a tags with target="_blank" and existing rel but missing noopener
  const regex2 = /<a\s+([^>]*?)rel=["']([^"']*)["']([^>]*?)target=["']_blank["']([^>]*?)>/gi;
  newContent = newContent.replace(regex2, (match, before, relValue, middle, after) => {
    if (!relValue.includes('noopener')) {
      changes++;
      const newRel = relValue ? `${relValue} noopener` : 'noopener';
      return `<a ${before}rel="${newRel}"${middle}target="_blank"${after}>`;
    }
    return match;
  });
  
  // Also handle reverse order (target before rel)
  const regex3 = /<a\s+([^>]*?)target=["']_blank["']([^>]*?)rel=["']([^"']*)["']([^>]*?)>/gi;
  newContent = newContent.replace(regex3, (match, before, middle, relValue, after) => {
    if (!relValue.includes('noopener')) {
      changes++;
      const newRel = relValue ? `${relValue} noopener` : 'noopener';
      return `<a ${before}target="_blank"${middle}rel="${newRel}"${after}>`;
    }
    return match;
  });
  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`Fixed ${changes} link security issues in ${file}`);
    filesChanged++;
    totalChanges += changes;
  }
});

console.log(`\nTotal: Fixed ${totalChanges} link security issues in ${filesChanged} files`);
