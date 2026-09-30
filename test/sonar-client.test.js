'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SonarApiError, SonarClient } = require('../src/sonar-client');

test('sends an encoded GET request with JSON Accept and optional token auth', async () => {
  let request;
  const client = new SonarClient({
    baseUrl: 'https://sonar.example/context',
    token: 'test-token',
    project: 'project key',
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return new Response('{"ok":true}', { status: 200 });
    }
  });

  assert.deepEqual(await client.get('/api/measures/component', {
    component: 'project:key with spaces',
    metricKeys: 'new_coverage'
  }), { ok: true });
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Accept, 'application/json');
  assert.equal(
    request.options.headers.Authorization,
    `Basic ${Buffer.from('test-token:').toString('base64')}`
  );
  assert.equal(request.url.pathname, '/context/api/measures/component');
  assert.equal(request.url.searchParams.get('component'), 'project:key with spaces');
  assert.equal(request.url.searchParams.get('metricKeys'), 'new_coverage');
});

test('uses anonymous access when no token is configured', async () => {
  let headers;
  const client = new SonarClient({
    baseUrl: 'https://sonar.example',
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return new Response('{}', { status: 200 });
    }
  });
  await client.get('/api/issues/search');
  assert.deepEqual(headers, { Accept: 'application/json' });
});

test('reports HTTP errors without leaking URL, project, token, or authorization data', async () => {
  const client = new SonarClient({
    baseUrl: 'https://test-sonar.example',
    token: 'test-token',
    project: 'test-project',
    fetchImpl: async () => new Response(
      'test-project test-token https://test-sonar.example Authorization: Basic fake-auth-value',
      { status: 403 }
    )
  });
  await assert.rejects(client.get('/api/issues/search'), (error) => {
    assert.ok(error instanceof SonarApiError);
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /test-project|test-token|test-sonar\.example|fake-auth-value/);
    return true;
  });
});

test('rejects invalid JSON and non-API endpoints', async () => {
  const client = new SonarClient({
    baseUrl: 'https://sonar.example',
    fetchImpl: async () => new Response('<html>not json</html>', { status: 200 })
  });
  await assert.rejects(client.get('/api/issues/search'), /not valid JSON/);
  await assert.rejects(client.get('/api/issues/assign'), /not in the read-only endpoint catalog/);
  await assert.rejects(client.get('/project/issues'), /not in the read-only endpoint catalog/);
});

test('surfaces bounded request timeouts', async () => {
  const client = new SonarClient({
    baseUrl: 'https://sonar.example',
    timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
    })
  });
  await assert.rejects(client.get('/api/issues/search'), /timed out after 5 ms/);
});
