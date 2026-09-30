'use strict';

const { runMetricDomain } = require('./metrics');

const COVERAGE_GROUPS = Object.freeze([
  Object.freeze({
    title: 'Código novo',
    metrics: Object.freeze([
      'new_coverage',
      'new_lines_to_cover',
      'new_uncovered_lines',
      'new_line_coverage',
      'new_conditions_to_cover',
      'new_uncovered_conditions',
      'new_branch_coverage'
    ])
  }),
  Object.freeze({
    title: 'Geral',
    metrics: Object.freeze([
      'coverage',
      'lines_to_cover',
      'uncovered_lines',
      'line_coverage',
      'conditions_to_cover',
      'uncovered_conditions',
      'branch_coverage'
    ])
  })
]);

async function runCoverage(options) {
  return runMetricDomain({
    ...options,
    domain: 'coverage',
    title: 'Métricas de cobertura',
    groups: COVERAGE_GROUPS,
    metrics: COVERAGE_GROUPS.flatMap((group) => group.metrics)
  });
}

module.exports = { COVERAGE_GROUPS, runCoverage };
