// The line above the results saying how the box was read (app.js
// paint_search_note), as data: each part is one line of the note.
//   { exact: true }           the box held a phrase in quotes
//   { phrase: '"a b"' }       words matched anywhere; offer the exact phrase
//   { storedAs: [names] }     author names also looked up as the PDB stores them
export function noteParts(reply) {
  const parts = [];
  if (reply.exact) parts.push({ exact: true });
  else if (reply.phrase && reply.total > 0) parts.push({ phrase: reply.phrase });
  if (reply.stored_as?.length) parts.push({ storedAs: reply.stored_as.join(", ") });
  return parts;
}
