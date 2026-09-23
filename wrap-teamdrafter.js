const fs = require('fs');
let c = fs.readFileSync('components/MatchForm.tsx', 'utf8');

// Wrap TeamDrafter in a conditional to hide it when editing
const teamDrafterPattern = /(\s*)<TeamDrafter\s*\n\s*savedRanks=\{savedRanksFor\(savedRanks\s*\?\?.*?\s*\/\s*>/g;

c = c.replace(teamDrafterPattern, (match, leadingSpace) => {
  return leadingSpace + '{!existing && (\n' + 
         leadingSpace + '  <TeamDrafter\n' +
         leadingSpace + '    savedRanks={savedRanksFor(savedRanks ?? {}, mode, submode)}\n' +
         leadingSpace + '    savedRanksLabel={`${mode} ${submode}`}\n' +
         leadingSpace + '    onApply={(teams, ranks) => setTeamsText(teamsToBlob(teams, ranks))}\n' +
         leadingSpace + '  />\n' +
         leadingSpace + ')}\n';
});

// Also wrap the closing brace of the teamSource === 'draft' block
c = c.replace(/\s*}\s*\)\s*\}\s*\n\s*\{rounds\.length > 0\}/, '\n      {rounds.length > 0}');

fs.writeFileSync('components/MatchForm.tsx', c);
console.log('Wrapped TeamDrafter in conditional');
