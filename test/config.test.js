'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  ConfigurationError,
  parseEnvFile,
  resolveConfig
} = require('../src/config');

function withEnvFile(contents, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarutils-config-'));
  const envFile = path.join(directory, '.env');
  fs.writeFileSync(envFile, contents, 'utf8');
  try {
    return callback(envFile);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('parses comments, quoted values, escapes, and inline comments', () => {
  assert.deepEqual(parseEnvFile([
    '# comment',
    'SONAR_URL="https://sonar.example/base" # URL',
    "SONAR_PROJECT='project key'",
    'SONAR_TOKEN=abc123 # local token',
    'SONAR_TOP_N=12'
  ].join('\n')), {
    SONAR_URL: 'https://sonar.example/base',
    SONAR_PROJECT: 'project key',
    SONAR_TOKEN: 'abc123',
    SONAR_TOP_N: '12'
  });
  assert.equal(parseEnvFile('SONAR_PROJECT="two\\nlines"').SONAR_PROJECT, 'two\nlines');
});

test('resolves CLI over process environment over .env and normalizes the URL', () => {
  withEnvFile('SONAR_URL=http://dotenv.example\nSONAR_PROJECT=dotenv-project\nSONAR_TOKEN=dotenv-token', (envFile) => {
    const config = resolveConfig({
      command: 'coverage',
      args: ['--url', 'https://cli.example/context///', '--project=cli-project'],
      env: {
        SONAR_URL: 'https://process.example',
        SONAR_PROJECT: 'process-project',
        SONAR_TOKEN: 'process-token'
      },
      envFile
    });
    assert.equal(config.url, 'https://cli.example/context');
    assert.equal(config.project, 'cli-project');
    assert.equal(config.token, 'process-token');
  });
});

test('uses environment over .env and requires both URL and project', () => {
  withEnvFile('SONAR_URL=http://dotenv.example/\nSONAR_PROJECT=dotenv-project', (envFile) => {
    const config = resolveConfig({
      command: 'coverage',
      env: { SONAR_URL: 'https://process.example/', SONAR_PROJECT: 'process-project' },
      envFile
    });
    assert.equal(config.url, 'https://process.example');
    assert.equal(config.project, 'process-project');
  });

  assert.throws(
    () => resolveConfig({ command: 'coverage', env: {}, envFile: path.join(os.tmpdir(), 'missing-sonarutils-env') }),
    (error) => error instanceof ConfigurationError && /SONAR_URL is required/.test(error.message)
  );
  assert.throws(
    () => resolveConfig({
      command: 'coverage',
      env: { SONAR_URL: 'https://sonar.example' },
      envFile: path.join(os.tmpdir(), 'missing-sonarutils-env')
    }),
    (error) => error instanceof ConfigurationError && /SONAR_PROJECT is required/.test(error.message)
  );
});

test('validates URL protocol, credentials, CLI flags, and positive Top N', () => {
  const envFile = path.join(os.tmpdir(), 'missing-sonarutils-env');
  const env = { SONAR_URL: 'https://sonar.example', SONAR_PROJECT: 'project' };

  assert.throws(
    () => resolveConfig({ command: 'conditions', env: { ...env, SONAR_TOP_N: '0' }, envFile }),
    /Top N must be a positive integer/
  );
  assert.throws(
    () => resolveConfig({ command: 'conditions', args: ['--top', '-2'], env, envFile }),
    /Top N must be a positive integer/
  );
  assert.throws(
    () => resolveConfig({ command: 'conditions', args: ['--top='], env, envFile }),
    /Top N must be a positive integer/
  );
  assert.throws(
    () => resolveConfig({ command: 'conditions', env: { ...env, SONAR_TOP_N: '' }, envFile }),
    /Top N must be a positive integer/
  );
  assert.throws(
    () => resolveConfig({ command: 'conditions', args: ['--top', '1e2'], env, envFile }),
    /Top N must be a positive integer/
  );
  assert.throws(
    () => resolveConfig({ command: 'conditions', args: ['--verbose'], env, envFile }),
    /Unknown option/
  );
  assert.throws(
    () => resolveConfig({ command: 'coverage', args: ['--top', '5'], env, envFile }),
    /Unknown option/
  );
  assert.throws(
    () => resolveConfig({ command: 'coverage', env: { ...env, SONAR_URL: 'ftp://sonar.example' }, envFile }),
    /must use HTTP\(S\)/
  );
});

test('defaults Conditions Top N to 30 and lets its CLI value override the environment', () => {
  const envFile = path.join(os.tmpdir(), 'missing-sonarutils-env');
  const env = { SONAR_URL: 'https://sonar.example', SONAR_PROJECT: 'project', SONAR_TOP_N: '20' };
  assert.equal(resolveConfig({ command: 'conditions', env, envFile }).top, 20);
  assert.equal(resolveConfig({ command: 'conditions', args: ['--top', '7'], env, envFile }).top, 7);
  assert.equal(resolveConfig({
    command: 'conditions',
    env: { SONAR_URL: env.SONAR_URL, SONAR_PROJECT: env.SONAR_PROJECT },
    envFile
  }).top, 30);
});
