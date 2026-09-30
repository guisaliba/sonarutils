'use strict';

const { runMetricDomain } = require('./metrics');

const TEST_METRICS = Object.freeze([
  'tests',
  'test_errors',
  'test_failures',
  'skipped_tests',
  'test_execution_time'
]);

async function runTests(options) {
  return runMetricDomain({
    ...options,
    domain: 'tests',
    title: 'Métricas de testes',
    metrics: TEST_METRICS
  });
}

module.exports = { TEST_METRICS, runTests };
