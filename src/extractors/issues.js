'use strict';

const { ISSUE_QUERIES, getAllIssues } = require('../api/issues');
const {
  OUTPUTS,
  escapeLinkLabel,
  escapeMarkdownCell,
  reportMetadata,
  rawMarkdown,
  requestLabel,
  statusLabel,
  table,
  writeReport
} = require('../reports/markdown');
const { safeErrorMessage } = require('../sonar-client');

const ISSUE_FIELDS = Object.freeze([
  ['type', 'Tipo'],
  ['severity', 'Severidade'],
  ['rule', 'Regra'],
  ['component', 'Arquivo'],
  ['line', 'Linha'],
  ['message', 'Mensagem'],
  ['status', 'Status'],
  ['resolution', 'Resolução'],
  ['effort', 'Esforço']
]);

function issueLink(config, issueKey) {
  const url = new URL(`${config.url}/project/issues`);
  url.searchParams.set('id', config.project);
  url.searchParams.set('issues', issueKey);
  const markdownUrl = url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `[${escapeLinkLabel(issueKey)}](${markdownUrl})`;
}

function relativeComponentPath(component, project) {
  if (typeof component !== 'string') {
    return undefined;
  }
  const prefix = `${project}:`;
  return component.startsWith(prefix) ? component.slice(prefix.length) : component;
}

function validateIssues(issues) {
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue) || typeof issue.key !== 'string') {
      throw new Error('Issue response contained an entry without a valid issue key.');
    }
  }
}

function availableFields(issues) {
  return ISSUE_FIELDS.filter(([field]) => issues.some((issue) => (
    field === 'component'
      ? typeof issue.component === 'string'
      : issue[field] !== undefined && issue[field] !== null
  )));
}

function issueRows(issues, fields, config) {
  return issues.map((issue) => [
    rawMarkdown(issueLink(config, issue.key)),
    ...fields.map(([field]) => {
      if (field === 'component') {
        return relativeComponentPath(issue.component, config.project) || '';
      }
      return issue[field] === undefined || issue[field] === null ? '' : String(issue[field]);
    })
  ]);
}

async function runIssues({
  client,
  config,
  generatedAt,
  reportWriter = writeReport
}) {
  const sections = [];
  const outcomes = [];

  for (const query of ISSUE_QUERIES) {
    try {
      const issues = await getAllIssues(client, config.project, query);
      validateIssues(issues);
      outcomes.push({ id: query.id, title: query.title, status: 'returned', count: issues.length });
      const fields = availableFields(issues);
      const headers = ['Issue', ...fields.map(([, title]) => title)];
      const renderedRows = issueRows(issues, fields, config);
      sections.push(
        `## ${query.title}`,
        `Status: **${requestLabel('returned')}** (${issues.length})`,
        renderedRows.length
          ? table(headers, renderedRows)
          : 'Nenhum issue retornado.'
      );
    } catch (error) {
      const message = safeErrorMessage(error, config);
      outcomes.push({ id: query.id, title: query.title, status: 'error', error: message });
      sections.push(
        `## ${query.title}`,
        `Status: **${requestLabel('error')}**`,
        `Erro: ${escapeMarkdownCell(message)}`
      );
    }
  }

  const failures = outcomes
    .filter((outcome) => outcome.status === 'error')
    .map((outcome) => `${outcome.title}: ${outcome.error}`);
  const status = failures.length ? 'incomplete' : 'complete';
  const contents = [
    '# Issues do projeto',
    reportMetadata({ config, generatedAt }),
    `Status: **${statusLabel(status)}**`,
    ...sections
  ];
  if (failures.length) {
    contents.push('## Falhas', ...failures.map((failure) => `- ${escapeMarkdownCell(failure)}`));
  }
  const outputPath = await reportWriter(OUTPUTS.issues, contents.join('\n\n'));
  return { domain: 'issues', title: 'Issues', outputPath, status, failures, queries: outcomes };
}

module.exports = {
  ISSUE_FIELDS,
  availableFields,
  issueLink,
  issueRows,
  relativeComponentPath,
  runIssues,
  validateIssues
};
