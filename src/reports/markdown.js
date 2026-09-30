'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const RAW_MARKDOWN = Symbol('rawMarkdown');
const OUTPUTS = Object.freeze({
  conditions: 'reports/conditions/report.md',
  coverage: 'reports/coverage/report.md',
  tests: 'reports/tests/report.md',
  issues: 'reports/issues/report.md',
  full: 'reports/full/report.md'
});

function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r\n|\r|\n/g, '<br>');
}

function escapeLinkLabel(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, ' ');
}

function rawMarkdown(value) {
  return { [RAW_MARKDOWN]: String(value) };
}

function renderCell(value) {
  return value && value[RAW_MARKDOWN] ? value[RAW_MARKDOWN] : escapeMarkdownCell(value);
}

function table(headers, rows) {
  if (!headers.length) {
    return '';
  }
  const head = `| ${headers.map(escapeMarkdownCell).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(renderCell).join(' | ')} |`);
  return [head, separator, ...body].join('\n');
}

function statusLabel(status) {
  return status === 'complete' ? 'Completo' : 'Incompleto';
}

function requestLabel(status) {
  return { returned: 'Retornado', no_measure: 'Sem medida', error: 'Erro' }[status] || status;
}

function reportMetadata({ config, generatedAt = new Date() }) {
  return [
    `Gerado em (UTC): ${generatedAt.toISOString()}`,
    `Projeto: ${escapeMarkdownCell(config.project)}`,
    'Escopo: projeto configurado'
  ].join('\n');
}

async function writeReport(relativePath, contents) {
  const absolutePath = path.resolve(ROOT, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${contents.trimEnd()}\n`, 'utf8');
  return relativePath;
}

module.exports = {
  OUTPUTS,
  ROOT,
  escapeLinkLabel,
  escapeMarkdownCell,
  rawMarkdown,
  reportMetadata,
  requestLabel,
  statusLabel,
  table,
  writeReport
};
