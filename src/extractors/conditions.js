'use strict';

const { getLeafComponents, getComponentMetric } = require('../api/component-tree');
const { getSourceLines } = require('../api/sources');
const { readNumericMeasure, readMeasureValue } = require('../api/measures');
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

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'abstract', 'final',
  'virtual', 'override', 'sealed', 'async', 'extern', 'readonly', 'const',
  'synchronized', 'native', 'default', 'inline', 'constexpr'
]);
const NON_METHOD_NAMES = new Set([
  'return', 'throw', 'if', 'for', 'while', 'switch', 'catch', 'do', 'new',
  'yield', 'using', 'lock', 'else', 'try', 'foreach', 'assert', 'super',
  'this', 'typeof', 'sizeof'
]);
const HTML_TAGS = /<\/?(?:span|br|div|pre|code|a|b|i|strong|em|td|tr|table)\b[^>]*>/gi;

function numericValue(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Source line field ${fieldName} was not numeric.`);
  }
  return number;
}

function lineUncoveredConditions(sourceLine) {
  if (sourceLine.uncoveredConditions !== undefined && sourceLine.uncoveredConditions !== null) {
    return numericValue(sourceLine.uncoveredConditions, 'uncoveredConditions');
  }
  if (sourceLine.conditions !== undefined && sourceLine.coveredConditions !== undefined) {
    return numericValue(sourceLine.conditions, 'conditions')
      - numericValue(sourceLine.coveredConditions, 'coveredConditions');
  }
  return undefined;
}

function decodeEntities(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== '#') {
      return entities[entity.toLowerCase()] || match;
    }
    const hex = entity[1].toLowerCase() === 'x';
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return '\ufffd';
    }
    return String.fromCodePoint(codePoint);
  });
}

function cleanSourceCode(value) {
  return decodeEntities(String(value).replace(HTML_TAGS, ''));
}

function declarationDetails(code) {
  const firstToken = code.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1];
  if (firstToken && NON_METHOD_NAMES.has(firstToken)) {
    return undefined;
  }
  const modifiersPattern = `((?:(?:${[...MODIFIERS].join('|')})\\s+)*)`;
  const typePattern = '(?:[A-Za-z_$][\\w$.<>?,\\[\\]&]*\\s+)+';
  const property = code.match(new RegExp(`^\\s*${modifiersPattern}${typePattern}([A-Za-z_$][\\w$]*)\\s*\\{\\s*(?:get|set|init)\\b`, 'i'));
  if (property) {
    const modifiers = property[1].trim().split(/\s+/).filter(Boolean);
    return {
      type: 'Propriedade',
      name: property[2],
      modifiers: modifiers.filter((modifier) => modifier !== 'static'),
      isStatic: modifiers.includes('static')
    };
  }

  const method = code.match(new RegExp(`^\\s*${modifiersPattern}${typePattern}([A-Za-z_$][\\w$]*)\\s*\\([^;]*\\)\\s*(?:throws\\b[^{}]+)?(?:\\{|=>|$)`, 'i'));
  if (method && !NON_METHOD_NAMES.has(method[2])) {
    const modifiers = method[1].trim().split(/\s+/).filter(Boolean);
    return {
      type: 'Método',
      name: method[2],
      modifiers: modifiers.filter((modifier) => modifier !== 'static'),
      isStatic: modifiers.includes('static')
    };
  }

  return undefined;
}

function countBraces(code, state) {
  let count = 0;
  let quote;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    const next = code[index + 1];
    if (state.inBlockComment) {
      if (character === '*' && next === '/') {
        state.inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      break;
    }
    if (character === '/' && next === '*') {
      state.inBlockComment = true;
      index += 1;
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '{') {
      count += 1;
    } else if (character === '}') {
      count -= 1;
    }
  }
  return count;
}

function memberMetadataForLines(sourceLines) {
  const members = [];
  const state = { inBlockComment: false };
  let depth = 0;
  let active;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index];
    const code = cleanSourceCode(sourceLine.code);
    if (active && index > active.declarationIndex && depth <= active.startDepth) {
      active = undefined;
    }
    const declaration = declarationDetails(code);
    if (declaration) {
      active = { ...declaration, startDepth: depth, declarationIndex: index };
    }
    members.push(active);
    depth += countBraces(code, state);
  }
  return members;
}

function hasNewMarker(sourceLine) {
  return typeof sourceLine.isNew === 'boolean' || typeof sourceLine.newLine === 'boolean';
}

function isNewSourceLine(sourceLine) {
  return sourceLine.isNew === true || sourceLine.newLine === true;
}

function selectUncoveredNewLines(sourceLines) {
  for (const sourceLine of sourceLines) {
    if (!sourceLine || typeof sourceLine !== 'object' || Array.isArray(sourceLine)
      || !Number.isSafeInteger(Number(sourceLine.line)) || Number(sourceLine.line) <= 0
      || typeof sourceLine.code !== 'string') {
      throw new Error('Source-lines response contained an invalid line entry.');
    }
  }
  if (sourceLines.length && !sourceLines.some(hasNewMarker)) {
    throw new Error('Source lines did not include isNew or newLine metadata.');
  }
  if (sourceLines.length && !sourceLines.some((sourceLine) => lineUncoveredConditions(sourceLine) !== undefined)) {
    throw new Error('Source lines did not include uncovered-condition metadata.');
  }

  const members = memberMetadataForLines(sourceLines);
  return sourceLines.flatMap((sourceLine, index) => {
    const uncoveredConditions = lineUncoveredConditions(sourceLine);
    if (!isNewSourceLine(sourceLine) || uncoveredConditions === undefined || uncoveredConditions <= 0) {
      return [];
    }
    const member = members[index];
    return [{
      line: Number(sourceLine.line),
      type: member ? member.type : '-',
      name: member ? member.name : '-',
      modifier: member && member.modifiers.length ? member.modifiers.join(' ') : '-',
      isStatic: member ? (member.isStatic ? 'Sim' : 'Não') : '-',
      code: cleanSourceCode(sourceLine.code)
    }];
  });
}

function sortComponents(components) {
  return [...components].sort((left, right) => (
    right.uncoveredConditions - left.uncoveredConditions
      || String(left.path).localeCompare(String(right.path))
  ));
}

function renderConditionDetails(outcomes) {
  return outcomes.map((outcome) => {
    const heading = `### ${escapeMarkdownCell(outcome.path)}`;
    if (outcome.status === 'error') {
      return [heading, `Status: **${requestLabel('error')}**`, `Erro: ${escapeMarkdownCell(outcome.error)}`].join('\n\n');
    }
    const lines = outcome.lines;
    const rows = lines.map((line) => [
      line.line,
      line.type,
      line.name,
      line.modifier,
      line.isStatic,
      line.code
    ]);
    return [
      heading,
      `Status: **${requestLabel('returned')}** (${lines.length} linha(s) relevante(s))`,
      rows.length
        ? table(['Linha', 'Tipo', 'Nome', 'Modificador', 'Estático', 'Código-fonte'], rows)
        : 'Nenhuma linha nova com condições não cobertas foi retornada.'
    ].join('\n\n');
  });
}

async function runConditions({
  client,
  config,
  generatedAt,
  reportWriter = writeReport
}) {
  let tree;
  let treeError;
  try {
    tree = await getLeafComponents(client, config.project);
  } catch (error) {
    treeError = safeErrorMessage(error, config);
  }

  const failures = [];
  const candidates = [];
  let branchMeasureCount = 0;
  let uncoveredMeasureCount = 0;

  if (treeError) {
    failures.push(`Árvore de componentes: ${treeError}`);
  } else {
    try {
      for (const component of tree) {
        if (!component || typeof component !== 'object' || Array.isArray(component)
          || typeof component.key !== 'string' || !component.key) {
          throw new Error('Component tree contained an entry without a valid key.');
        }
        if (component.qualifier !== undefined && component.qualifier !== 'FIL') {
          throw new Error('Component tree returned an item outside the requested FIL qualifier.');
        }
        const uncoveredMeasure = getComponentMetric(component, 'new_uncovered_conditions');
        const branchMeasure = getComponentMetric(component, 'new_branch_coverage');
        if (branchMeasure) {
          branchMeasureCount += 1;
        }
        if (!uncoveredMeasure) {
          continue;
        }
        uncoveredMeasureCount += 1;
        const uncovered = readNumericMeasure(uncoveredMeasure, 'new_uncovered_conditions');
        const branchCoverage = branchMeasure
          ? readMeasureValue(branchMeasure, 'new_branch_coverage')
          : undefined;
        const rawPath = component.path || component.name || component.key;
        candidates.push({
          key: component.key,
          path: rawPath,
          uncoveredConditions: uncovered.value,
          branchCoverage: branchCoverage && branchCoverage.bestValue
            ? 'bestValue=true (valor omitido pela API)'
            : branchCoverage && branchCoverage.value !== undefined
              ? `${branchCoverage.value}%`
              : undefined
        });
      }
    } catch (error) {
      treeError = safeErrorMessage(error, config);
      failures.push(`Árvore de componentes: ${treeError}`);
      candidates.length = 0;
    }
  }

  const ranked = sortComponents(candidates).slice(0, config.top);
  const fileOutcomes = [];
  if (!treeError) {
    for (const component of ranked) {
      try {
        const sources = await getSourceLines(client, component.key);
        const lines = selectUncoveredNewLines(sources);
        fileOutcomes.push({ ...component, status: 'returned', lines });
      } catch (error) {
        const message = safeErrorMessage(error, config);
        failures.push(`${component.path}: ${message}`);
        fileOutcomes.push({ ...component, status: 'error', error: message });
      }
    }
  }

  const status = failures.length ? 'incomplete' : 'complete';
  const rankingStatus = treeError
    ? requestLabel('error')
    : uncoveredMeasureCount
      ? requestLabel('returned')
      : requestLabel('no_measure');
  const branchStatus = treeError
    ? requestLabel('error')
    : branchMeasureCount
      ? requestLabel('returned')
      : requestLabel('no_measure');
  const rankingRows = ranked.map((component, index) => [
    index + 1,
    component.path,
    component.uncoveredConditions,
    component.branchCoverage || ''
  ]);
  const sections = [
    '# Condições não cobertas em código novo',
    reportMetadata({ config, generatedAt }),
    `Status: **${statusLabel(status)}**`,
    `Consulta da árvore de componentes: **${treeError ? requestLabel('error') : requestLabel('returned')}**`,
    `new_uncovered_conditions: **${rankingStatus}**`,
    `new_branch_coverage: **${branchStatus}**`,
    `Top N: ${config.top}`,
    '## Ranking de arquivos',
    rankingRows.length
      ? table(['Posição', 'Arquivo', 'Condições novas não cobertas', 'Cobertura de branches no código novo'], rankingRows)
      : 'Nenhum arquivo retornou a medida new_uncovered_conditions.',
    '## Detalhes por arquivo',
    ...renderConditionDetails(fileOutcomes)
  ];
  if (failures.length) {
    sections.push('## Falhas', ...failures.map((failure) => `- ${escapeMarkdownCell(failure)}`));
  }

  const outputPath = await reportWriter(OUTPUTS.conditions, sections.join('\n\n'));
  return {
    domain: 'conditions',
    title: 'Conditions',
    outputPath,
    status,
    failures,
    queries: [
      { id: 'component-tree', title: 'Árvore de componentes', status: treeError ? 'error' : 'returned', error: treeError },
      { id: 'new_uncovered_conditions', status: rankingStatus === 'Sem medida' ? 'no_measure' : treeError ? 'error' : 'returned' },
      { id: 'new_branch_coverage', status: branchStatus === 'Sem medida' ? 'no_measure' : treeError ? 'error' : 'returned' },
      ...fileOutcomes.map((outcome) => ({
        id: outcome.key,
        title: outcome.path,
        status: outcome.status,
        error: outcome.error
      }))
    ]
  };
}

module.exports = {
  cleanSourceCode,
  declarationDetails,
  decodeEntities,
  lineUncoveredConditions,
  memberMetadataForLines,
  runConditions,
  selectUncoveredNewLines,
  sortComponents
};
