export function noteParts(reply) {
  const parts = [];
  if (reply.exact) parts.push({ exact: true });
  else if (reply.phrase && reply.total > 0) parts.push({ phrase: reply.phrase });
  if (reply.stored_as?.length) parts.push({ storedAs: reply.stored_as.join(", ") });
  return parts;
}
