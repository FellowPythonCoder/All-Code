export async function inspectEngine(client) {
  try { await client.search('', 'web', null); }
  catch (error) { return error.code === 'INVALID_QUERY' && error.status === 400 && !client.failure; }
  return false;
}
