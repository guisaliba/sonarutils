'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const packageMetadata = require('../package.json');
const { runCli } = require('../src/cli');
const { EXTRACTORS, renderFullSummary, runFullScan } = require('../src/full-scan');
const { OUTPUTS, ROOT } = require('../src/reports/markdown');

const config = {
  url: 'https://sonar.example',
  project: 'project-key',
  top: 30
};

test('the full-scan catalog is Conditions, Coverage, Tests, then Issues', () => {
  assert.deepEqual(EXTRACTORS.map((extractor) => extractor.domain), [
    'conditions',
    'coverage',
    'tests',
    'issues'
  ]);
});

test('npm start preserves the standalone Conditions workflow', () => {
  assert.equal(packageMetadata.scripts.start, packageMetadata.scripts.conditions);
  assert.equal(packageMetadata.scripts.start, 'node src/cli.js conditions');
});

test('runs extractors sequentially, continues after failure, and writes a full report', async () => {
  const sequence = [];
  const reports = new Map();
  const outcome = await runFullScan({
    client: {},
    config,
    generatedAt: new Date('2026-09-25T10:15:00.000Z'),
    reportWriter: async (outputPath, contents) => {
      reports.set(outputPath, contents);
      return outputPath;
    },
    extractors: [
      {
        domain: 'conditions',
        title: 'Conditions',
        run: async () => {
          sequence.push('conditions:start');
          await new Promise((resolve) => setImmediate(resolve));
          sequence.push('conditions:end');
          return {
            domain: 'conditions',
            title: 'Conditions',
            outputPath: OUTPUTS.conditions,
            status: 'complete',
            failures: [],
            queries: [{ id: 'component-tree', status: 'returned' }]
          };
        }
      },
      {
        domain: 'coverage',
        title: 'Coverage',
        run: async () => {
          sequence.push('coverage');
          throw new Error('one extractor failed');
        }
      },
      {
        domain: 'tests',
        title: 'Tests',
        run: async () => {
          sequence.push('tests');
          return {
            domain: 'tests',
            title: 'Tests',
            outputPath: OUTPUTS.tests,
            status: 'complete',
            failures: [],
            queries: [{ id: 'tests', status: 'returned' }]
          };
        }
      }
    ]
  });

  assert.deepEqual(sequence, ['conditions:start', 'conditions:end', 'coverage', 'tests']);
  assert.equal(outcome.status, 'incomplete');
  assert.deepEqual(outcome.failures, ['one extractor failed']);
  assert.match(outcome.summary, /Coverage: Incompleto/);
  assert.match(outcome.summary, /reports\/coverage\/report\.md/);
  const report = reports.get(OUTPUTS.full);
  assert.match(report, /Status: \*\*Incompleto\*\*/);
  assert.match(report, /component-tree/);
  assert.match(report, /one extractor failed/);
});

test('summary is complete only when every domain succeeded', () => {
  assert.match(renderFullSummary([
    { title: 'Coverage', status: 'complete', outputPath: OUTPUTS.coverage, failures: [] }
  ]), /Full scan: Completo/);
  assert.match(renderFullSummary([
    { title: 'Coverage', status: 'incomplete', outputPath: OUTPUTS.coverage, failures: ['query failed'] }
  ]), /Falhas: 1/);
});

test('CLI returns a nonzero process exit code for an incomplete full scan', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  console.log = () => {};
  try {
    process.exitCode = 0;
    await runCli([
      'full-scan',
      '--url', 'https://sonar.example',
      '--project', 'project-key'
    ], {
      env: {},
      envFile: path.join(ROOT, 'missing-test-env'),
      createClient: () => ({}),
      runFullScan: async () => ({
        status: 'incomplete',
        outputPath: OUTPUTS.full,
        summary: 'Full scan: Incompleto'
      })
    });
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = originalLog;
    process.exitCode = previousExitCode;
  }
});
