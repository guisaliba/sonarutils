'use strict';

const { ResponseSchemaError } = require('./measures');

async function getSourceLines(client, componentKey) {
  const response = await client.get('/api/sources/lines', { key: componentKey });
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || !Array.isArray(response.sources)) {
    throw new ResponseSchemaError('Source-lines response must include a sources array.');
  }
  return response.sources;
}

module.exports = { getSourceLines };
