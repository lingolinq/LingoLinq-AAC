// Bookmarklet to check organization data in browser console
// Copy this entire code, create a bookmark, and paste it as the URL
// Then click the bookmark while on the app page

javascript:(function(){
  var user = window.app_state && window.app_state.get('currentUser');
  if(!user) {
    console.log('❌ No current user found');
    return;
  }
  
  console.log('=== ORGANIZATION DEBUG ===');
  console.log('Organizations:', user.get('organizations'));
  console.log('Managed orgs:', user.get('managed_orgs'));
  console.log('Has management responsibility:', user.get('has_management_responsibility'));
  console.log('Manages multiple orgs:', user.get('manages_multiple_orgs'));
  
  var orgs = user.get('organizations');
  if(orgs && orgs.length > 0) {
    console.log('✓ Organizations array has', orgs.length, 'item(s)');
    orgs.forEach(function(org, idx) {
      console.log('  [' + idx + ']', org.name || org.id, '- Type:', org.type, '- Restricted:', org.restricted);
    });
  } else {
    console.log('❌ Organizations array is empty or undefined');
  }
  
  var managed = user.get('managed_orgs');
  if(managed && managed.length > 0) {
    console.log('✓ Managed orgs has', managed.length, 'item(s)');
  } else {
    console.log('❌ Managed orgs is empty');
    console.log('   This means: type != "manager" OR restricted == true');
  }
  
  console.log('=== FORCE RELOAD ===');
  console.log('Run this to force reload:');
  console.log('app_state.get("currentUser").reload().then(function() { console.log("Reloaded!"); });');
})();


