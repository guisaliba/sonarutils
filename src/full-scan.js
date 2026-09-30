'use strict';

const { runConditions } = require('./extractors/conditions');
const { runCoverage } = require('./extractors/coverage');
const { runIssues } = require('./extractors/issues');
const { runTests } = require('./extractors/tests');
const {
  OUTPUTS,
  reportMetadata,
  requestLabel,
  statusLabel,
  table,
  writeReport
} = require('./reports/markdown');
const { safeErrorMessage } = require('./sonar-client');

const EXTRACTORS = Object.freeze([
  Object.freeze({ domain: 'conditions', title: 'Conditions', run: runConditions }),
  Object.freeze({ domain: 'coverage', title: 'Coverage', run: runCoverage }),
  Object.freeze({ domain: 'tests', title: 'Tests', run: runTests }),
  Object.freeze({ domain: 'issues', title: 'Issues', run: runIssues })
]);

function renderFullSummary(outcomes) {
  const incomplete = outcomes.some((outcome) => outcome.status !== 'complete');
  const lines = [`Full scan: ${statusLabel(incomplete ? 'incomplete' : 'complete')}`];
  for (const outcome of outcomes) {
    lines.push(`- ${outcome.title}: ${statusLabel(outcome.status)} - ${outcome.outputPath}`);
  }
  const failures = outcomes.flatMap((outcome) => outcome.failures || []);
  if (failures.length) {
    lines.push(`Falhas: ${failures.length}`);
  }
  return lines.join('\n');
}

async function runFullScan({
  client,
  config,
  generatedAt,
  reportWriter = writeReport,
  extractors = EXTRACTORS
}) {
  const outcomes = [];
  for (const extractor of extractors) {
    try {
      const outcome = await extractor.run({ client, config, generatedAt, reportWriter });
      outcomes.push(outcome);
    } catch (error) {
      const message = safeErrorMessage(error, config);
      outcomes.push({
        domain: extractor.domain,
        title: extractor.title,
        outputPath: OUTPUTS[extractor.domain],
        status: 'incomplete',
        failures: [message],
        queries: []
      });
    }
  }

  const status = outcomes.some((outcome) => outcome.status !== 'complete')
    ? 'incomplete'
    : 'complete';
  const summaryRows = outcomes.map((outcome) => [
    outcome.title,
    statusLabel(outcome.status),
    outcome.outputPath,
    (outcome.failures || []).join('; ')
  ]);
  const queryRows = outcomes.flatMap((outcome) => (outcome.queries || []).map((query) => [
    outcome.title,
    query.title || query.id,
    requestLabel(query.status),
    query.error || ''
  ]));
  const contents = [
    '# Relatório da execução completa',
    reportMetadata({ config, generatedAt }),
    `Status: **${statusLabel(status)}**`,
    '## Extratores',
    table(['Domínio', 'Status', 'Relatório', 'Falhas'], summaryRows),
    '## Consultas',
    queryRows.length
      ? table(['Domínio', 'Consulta', 'Status', 'Erro'], queryRows)
      : 'Nenhuma consulta foi concluída.'
  ];
  const outputPath = await reportWriter(OUTPUTS.full, contents.join('\n\n'));
  return {
    domain: 'full',
    title: 'Full scan',
    outputPath,
    status,
    failures: outcomes.flatMap((outcome) => outcome.failures || []),
    outcomes,
    summary: renderFullSummary(outcomes)
  };
}

module.exports = { EXTRACTORS, renderFullSummary, runFullScan };
