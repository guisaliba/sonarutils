'use strict';

class SonarApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SonarApiError';
  }
}

const READ_ONLY_ENDPOINTS = new Set([
  '/api/measures/component',
  '/api/measures/component_tree',
  '/api/sources/lines',
  '/api/issues/search'
]);

function sanitizeMessage(message, config) {
  let safe = String(message || 'Unknown error');
  const project = config && config.project;
  const secrets = [
    config && config.token,
    config && config.url,
    project,
    project && encodeURIComponent(project),
    project && encodeURIComponent(project).replace(/%20/g, '+')
  ];
  for (const secret of secrets) {
    if (secret) {
      safe = safe.split(secret).join('[redacted]');
    }
  }
  return safe
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '[redacted authorization]')
    .replace(/authorization\s*:\s*[^\s,;]+/gi, 'authorization: [redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
}

class SonarClient {
  constructor({ baseUrl, token, project, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required.');
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive integer.');
    }
    this.baseUrl = baseUrl;
    this.token = token;
    this.project = project;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async get(endpoint, parameters = {}) {
    if (!READ_ONLY_ENDPOINTS.has(endpoint)) {
      throw new TypeError('Sonar API endpoint is not in the read-only endpoint catalog.');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = { Accept: 'application/json' };
    if (this.token) {
      headers.Authorization = `Basic ${Buffer.from(`${this.token}:`).toString('base64')}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    let response;
    let body;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      body = await response.text();
    } catch (error) {
      if (timedOut) {
        throw new SonarApiError(`GET ${endpoint}: timed out after ${this.timeoutMs} ms.`);
      }
      if (response) {
        throw new SonarApiError(`GET ${endpoint}: could not read response (${sanitizeMessage(error && error.message, {
          token: this.token,
          url: this.baseUrl,
          project: this.project
        })}).`);
      }
      throw new SonarApiError(`GET ${endpoint}: network failure (${sanitizeMessage(error && error.message, {
        token: this.token,
        url: this.baseUrl,
        project: this.project
      })}).`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const excerpt = body ? `: ${sanitizeMessage(body, {
        token: this.token,
        url: this.baseUrl,
        project: this.project
      })}` : '';
      throw new SonarApiError(`GET ${endpoint}: HTTP ${response.status}${excerpt}`);
    }

    try {
      return JSON.parse(body);
    } catch {
      const excerpt = body ? ` (${sanitizeMessage(body, {
        token: this.token,
        url: this.baseUrl,
        project: this.project
      })})` : '';
      throw new SonarApiError(`GET ${endpoint}: response was not valid JSON${excerpt}.`);
    }
  }
}

function safeErrorMessage(error, config) {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeMessage(message, config);
}

module.exports = { READ_ONLY_ENDPOINTS, SonarApiError, SonarClient, safeErrorMessage, sanitizeMessage };
