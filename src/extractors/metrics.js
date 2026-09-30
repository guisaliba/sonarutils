'use strict';

const { getProjectMeasure } = require('../api/measures');
const {
  OUTPUTS,
  escapeMarkdownCell,
  reportMetadata,
  requestLabel,
  statusLabel,
  table,
  writeReport
} = require('../reports/markdown');
const { safeErrorMessage } = require('../sonar-client');

const PERCENTAGE_METRICS = new Set([
  'coverage',
  'line_coverage',
  'branch_coverage',
  'new_coverage',
  'new_line_coverage',
  'new_branch_coverage'
]);

function displayMeasure(metric, measure) {
  if (measure.bestValue) {
    return 'bestValue=true (valor omitido pela API)';
  }
  const value = String(measure.value);
  if (PERCENTAGE_METRICS.has(metric)) {
    return `${value}%`;
  }
  if (metric === 'test_execution_time') {
    return `${value} ms`;
  }
  return value;
}

async function queryMetrics(client, config, metrics) {
  const outcomes = [];
  for (const metric of metrics) {
    try {
      const result = await getProjectMeasure(client, config.project, metric);
      outcomes.push(result.found
        ? { metric, status: 'returned', value: result.value, bestValue: result.bestValue }
        : { metric, status: 'no_measure' });
    } catch (error) {
      outcomes.push({
        metric,
        status: 'error',
        error: safeErrorMessage(error, config)
      });
    }
  }
  return outcomes;
}

function metricReportRows(metrics) {
  return metrics.map((result) => [
    result.metric,
    requestLabel(result.status),
    result.status === 'returned' ? displayMeasure(result.metric, result) : '',
    result.error || ''
  ]);
}

async function runMetricDomain({
  client,
  config,
  domain,
  title,
  groups,
  metrics,
  generatedAt,
  reportWriter = writeReport
}) {
  const outcomes = await queryMetrics(client, config, metrics);
  const failures = outcomes
    .filter((result) => result.status === 'error')
    .map((result) => `${result.metric}: ${result.error}`);
  const status = failures.length ? 'incomplete' : 'complete';

  const sections = [`# ${title}`, reportMetadata({ config, generatedAt }), `Status: **${statusLabel(status)}**`];
  if (groups) {
    for (const group of groups) {
      const rows = outcomes.filter((result) => group.metrics.includes(result.metric));
      sections.push(`## ${group.title}`, table(
        ['Métrica', 'Status', 'Valor', 'Erro'],
        metricReportRows(rows)
      ));
    }
  } else {
    sections.push(table(['Métrica', 'Status', 'Valor', 'Erro'], metricReportRows(outcomes)));
  }
  if (failures.length) {
    sections.push('## Falhas', ...failures.map((failure) => `- ${escapeMarkdownCell(failure)}`));
  }

  const outputPath = await reportWriter(OUTPUTS[domain], sections.join('\n\n'));
  return { domain, title, outputPath, status, failures, queries: outcomes };
}

module.exports = {
  PERCENTAGE_METRICS,
  displayMeasure,
  metricReportRows,
  queryMetrics,
  runMetricDomain
};
