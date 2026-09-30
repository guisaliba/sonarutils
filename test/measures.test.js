'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getProjectMeasure,
  parseMeasureResponse
} = require('../src/api/measures');

test('distinguishes a returned metric from a successful response with no measure', () => {
  assert.deepEqual(parseMeasureResponse({
    component: { measures: [{ metric: 'coverage', value: '82.4' }] }
  }, 'coverage'), { found: true, value: '82.4', periodIndex: undefined, bestValue: false });
  assert.deepEqual(parseMeasureResponse({ component: { measures: [] } }, 'coverage'), { found: false });
});

test('selects period index 1 for new-code measures', () => {
  assert.deepEqual(parseMeasureResponse({
    component: {
      measures: [{
        metric: 'new_uncovered_conditions',
        periods: [{ index: 2, value: '9' }, { index: 1, value: '3' }]
      }]
    }
  }, 'new_uncovered_conditions'), {
    found: true,
    value: '3',
    periodIndex: 1
  });
});

test('prefers the new-code period over an aggregate value when both are returned', () => {
  assert.deepEqual(parseMeasureResponse({
    component: {
      measures: [{
        metric: 'new_coverage',
        value: '82.4',
        periods: [{ index: 1, value: '63.1' }, { index: 2, value: '70.0' }]
      }]
    }
  }, 'new_coverage'), {
    found: true,
    value: '63.1',
    periodIndex: 1
  });
});

test('rejects ambiguous new-code periods and malformed response schemas', () => {
  assert.throws(() => parseMeasureResponse({
    component: {
      measures: [{
        metric: 'new_coverage',
        periods: [{ index: 2, value: '50' }, { index: 3, value: '55' }]
      }]
    }
  }, 'new_coverage'), /unambiguous new-code period/);
  assert.throws(() => parseMeasureResponse({
    component: {
      measures: [{
        metric: 'new_coverage',
        periods: [{ index: 2, value: '50' }]
      }]
    }
  }, 'new_coverage'), /unambiguous new-code period/);
  assert.throws(() => parseMeasureResponse({ component: {} }, 'coverage'), /component\.measures/);
  assert.throws(() => parseMeasureResponse({
    component: { measures: [{ metric: 'coverage' }, { metric: 'coverage' }] }
  }, 'coverage'), /duplicate entries/);
});

test('requests one project metric with encoded project key and period details', async () => {
  let request;
  const result = await getProjectMeasure({
    get: async (endpoint, parameters) => {
      request = { endpoint, parameters };
      return { component: { measures: [{ metric: 'new_branch_coverage', value: '76.1' }] } };
    }
  }, 'project/key', 'new_branch_coverage');

  assert.equal(request.endpoint, '/api/measures/component');
  assert.deepEqual(request.parameters, {
    component: 'project/key',
    metricKeys: 'new_branch_coverage',
    additionalFields: 'periods'
  });
  assert.equal(result.value, '76.1');
});
