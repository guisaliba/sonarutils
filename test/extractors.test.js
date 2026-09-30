'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ISSUE_QUERIES } = require('../src/api/issues');
const { runConditions } = require('../src/extractors/conditions');
const { COVERAGE_GROUPS, runCoverage } = require('../src/extractors/coverage');
const { issueLink, runIssues } = require('../src/extractors/issues');
const { TEST_METRICS, runTests } = require('../src/extractors/tests');
const { OUTPUTS } = require('../src/reports/markdown');

const config = {
  url: 'https://sonar.example',
  project: 'project-key',
  top: 30
};

function createReportWriter() {
  const reports = new Map();
  return {
    reports,
    writeReport: async (outputPath, contents) => {
      reports.set(outputPath, contents);
      return outputPath;
    }
  };
}

function responseForIssues(issues, page, pageSize, total) {
  return { issues, paging: { pageIndex: page, pageSize, total } };
}

test('Coverage and Tests query every catalog metric independently and report mixed outcomes', async () => {
  const coverageReports = createReportWriter();
  const coverageRequests = [];
  const coverage = await runCoverage({
    config,
    reportWriter: coverageReports.writeReport,
    client: {
      get: async (_endpoint, parameters) => {
        coverageRequests.push(parameters.metricKeys);
        if (parameters.metricKeys === 'uncovered_lines') {
          return { component: { measures: [] } };
        }
        if (parameters.metricKeys === 'lines_to_cover') {
          throw new Error('HTTP 503 from test service');
        }
        return { component: { measures: [{ metric: parameters.metricKeys, value: '12.5' }] } };
      }
    }
  });

  const coverageCatalog = COVERAGE_GROUPS.flatMap((group) => group.metrics);
  assert.equal(coverageRequests.length, 14);
  assert.deepEqual(coverageRequests, coverageCatalog);
  assert.equal(new Set(coverageRequests).size, 14);
  assert.equal(coverageRequests.filter((metric) => metric === 'branch_coverage').length, 1);
  assert.equal(coverageRequests.filter((metric) => metric === 'new_branch_coverage').length, 1);
  assert.equal(coverage.status, 'incomplete');
  assert.equal(coverage.queries.find((item) => item.metric === 'uncovered_lines').status, 'no_measure');
  assert.equal(coverage.queries.find((item) => item.metric === 'lines_to_cover').status, 'error');

  const coverageReport = coverageReports.reports.get(OUTPUTS.coverage);
  assert.match(coverageReport, /Status: \*\*Incompleto\*\*/);
  assert.match(coverageReport, /new_coverage.*Retornado/);
  assert.match(coverageReport, /uncovered_lines.*Sem medida/);
  assert.match(coverageReport, /branch_coverage/);

  const testRequests = [];
  const testReports = createReportWriter();
  const tests = await runTests({
    config,
    reportWriter: testReports.writeReport,
    client: {
      get: async (_endpoint, parameters) => {
        testRequests.push(parameters.metricKeys);
        return { component: { measures: [{ metric: parameters.metricKeys, value: '1250' }] } };
      }
    }
  });
  assert.deepEqual(testRequests, TEST_METRICS);
  assert.equal(tests.status, 'complete');
  const testReport = testReports.reports.get(OUTPUTS.tests);
  assert.match(testReport, /1250 ms/);
});

test('successful no-measure responses do not make a metric domain incomplete', async () => {
  const outcome = await runCoverage({
    config,
    reportWriter: createReportWriter().writeReport,
    client: {
      get: async () => ({ component: { measures: [] } })
    }
  });
  assert.equal(outcome.status, 'complete');
  assert.equal(outcome.failures.length, 0);
  assert.equal(outcome.queries.length, 14);
  assert.ok(outcome.queries.every((query) => query.status === 'no_measure'));
});

test('Issues uses exact filters, preserves overlapping sections, and escapes table content', async () => {
  const requests = [];
  const issueReports = createReportWriter();
  const sharedIssue = {
    key: 'ISSUE-1',
    type: 'CODE_SMELL',
    severity: 'MAJOR',
    rule: 'repo:rule',
    component: 'project-key:src/File.java',
    line: 7,
    message: 'message | with\nline',
    status: 'OPEN',
    effort: '5min'
  };
  const outcome = await runIssues({
    config,
    reportWriter: issueReports.writeReport,
    client: {
      get: async (_endpoint, parameters) => {
        requests.push({ ...parameters });
        const issues = parameters.types === 'BUG'
          ? [{ ...sharedIssue, key: 'BUG-1', type: 'BUG' }]
          : parameters.types === 'VULNERABILITY'
            ? []
            : [sharedIssue];
        return responseForIssues(issues, Number(parameters.p), Number(parameters.ps), issues.length);
      }
    }
  });

  assert.equal(outcome.status, 'complete');
  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(({ resolved, types, inNewCodePeriod }) => ({ resolved, types, inNewCodePeriod })),
    [
      { resolved: 'false', types: undefined, inNewCodePeriod: undefined },
      { resolved: 'false', types: 'CODE_SMELL', inNewCodePeriod: 'true' },
      { resolved: 'false', types: 'BUG', inNewCodePeriod: undefined },
      { resolved: 'false', types: 'VULNERABILITY', inNewCodePeriod: undefined }
    ]
  );
  assert.deepEqual(outcome.queries.map((query) => query.count), [1, 1, 1, 0]);
  assert.equal(ISSUE_QUERIES.length, 4);

  const report = issueReports.reports.get(OUTPUTS.issues);
  assert.equal((report.match(/\[ISSUE-1\]\(/g) || []).length, 2);
  assert.match(report, /message \\| with<br>line/);
  assert.match(report, /src\/File\.java/);
});

test('issue links URL-encode the project and issue identifiers', () => {
  const link = issueLink({
    url: 'https://sonar.example',
    project: 'project/with space'
  }, 'ISSUE/key');
  assert.match(link, /id=project%2Fwith\+space/);
  assert.match(link, /issues=ISSUE%2Fkey/);
});

test('Issues omits a failed query page while retaining successful sibling query rows', async () => {
  const issueReports = createReportWriter();
  const outcome = await runIssues({
    config,
    reportWriter: issueReports.writeReport,
    client: {
      get: async (_endpoint, parameters) => {
        if (parameters.types === 'CODE_SMELL') {
          if (parameters.p === 2) {
            throw new Error('page two unavailable');
          }
          return responseForIssues([{
            key: 'PARTIAL-ISSUE',
            component: 'project-key:partial.java',
            message: 'must not be reported'
          }], 1, 1, 2);
        }
        const issues = parameters.resolved === 'false'
          ? [{ key: 'COMPLETE-ISSUE', component: 'project-key:complete.java', message: 'kept' }]
          : [];
        return responseForIssues(issues, 1, 500, issues.length);
      }
    }
  });

  assert.equal(outcome.status, 'incomplete');
  assert.equal(outcome.queries.find((query) => query.id === 'new-code-smells').status, 'error');
  const report = issueReports.reports.get(OUTPUTS.issues);
  assert.match(report, /COMPLETE-ISSUE/);
  assert.doesNotMatch(report, /PARTIAL-ISSUE|must not be reported/);
});

test('Conditions preserves new-line uncovered-condition detail and member metadata', async () => {
  const sourceLines = [
    {
      line: 1,
      code: '<span class="line">public static int calculate() {</span>',
      isNew: false,
      uncoveredConditions: 0
    },
    {
      line: 2,
      code: 'return left &amp;&amp; right;',
      isNew: true,
      conditions: 2,
      coveredConditions: 1
    },
    { line: 3, code: '}', isNew: true, uncoveredConditions: 0 },
    { line: 4, code: 'public int Value { get; set; }', newLine: true, uncoveredConditions: 1 }
  ];
  const calls = [];
  const conditionReports = createReportWriter();
  const outcome = await runConditions({
    config,
    generatedAt: new Date('2026-09-25T10:00:00.000Z'),
    reportWriter: conditionReports.writeReport,
    client: {
      get: async (endpoint, parameters) => {
        calls.push({ endpoint, parameters });
        if (endpoint === '/api/measures/component_tree') {
          return {
            components: [{
              key: 'project-key:src/A.java',
              path: 'src/A.java',
              qualifier: 'FIL',
              measures: [
                { metric: 'new_uncovered_conditions', value: '2' },
                {
                  metric: 'new_branch_coverage',
                  periods: [{ index: 2, value: '50' }, { index: 1, value: '75.0' }]
                }
              ]
            }],
            paging: { pageIndex: Number(parameters.p), pageSize: 500, total: 1 }
          };
        }
        assert.equal(endpoint, '/api/sources/lines');
        assert.equal(parameters.key, 'project-key:src/A.java');
        return { sources: sourceLines };
      }
    }
  });

  assert.equal(outcome.status, 'complete');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].parameters.metricKeys, 'new_uncovered_conditions,new_branch_coverage');
  assert.equal(calls[0].parameters.qualifiers, 'FIL');
  assert.equal(calls[0].parameters.strategy, 'leaves');
  const report = conditionReports.reports.get(OUTPUTS.conditions);
  assert.match(report, /Gerado em \(UTC\): 2026-09-25T10:00:00\.000Z/);
  assert.match(report, /src\/A\.java/);
  assert.match(report, /75\.0%/);
  assert.match(report, /Método/);
  assert.match(report, /calculate/);
  assert.match(report, /Propriedade/);
  assert.match(report, /left &amp;&amp; right/);
  assert.doesNotMatch(report, /Nenhuma linha nova/);
});

test('Conditions ranks by uncovered new-code conditions and applies Top N', async () => {
  const components = [
    ['src/low.java', '1'],
    ['src/high.java', '9'],
    ['src/middle.java', '4']
  ].map(([file, value]) => ({
    key: `project-key:${file}`,
    path: file,
    qualifier: 'FIL',
    measures: [{ metric: 'new_uncovered_conditions', value }]
  }));
  const sourceRequests = [];
  const conditionReports = createReportWriter();
  const outcome = await runConditions({
    config: { ...config, top: 2 },
    reportWriter: conditionReports.writeReport,
    client: {
      get: async (endpoint, parameters) => {
        if (endpoint === '/api/measures/component_tree') {
          return {
            components,
            paging: { pageIndex: Number(parameters.p), pageSize: 500, total: components.length }
          };
        }
        sourceRequests.push(parameters.key);
        return { sources: [] };
      }
    }
  });

  assert.equal(outcome.status, 'complete');
  assert.deepEqual(sourceRequests, [
    'project-key:src/high.java',
    'project-key:src/middle.java'
  ]);
  const report = conditionReports.reports.get(OUTPUTS.conditions);
  assert.ok(report.indexOf('src/high.java') < report.indexOf('src/middle.java'));
  assert.doesNotMatch(report, /src\/low\.java/);
  assert.match(report, /Top N: 2/);
});

test('Conditions retains successful files and marks a source-request failure incomplete', async () => {
  const conditionReports = createReportWriter();
  const components = ['src/A.java', 'src/B.java'].map((file, index) => ({
    key: `project-key:${file}`,
    path: file,
    qualifier: 'FIL',
    measures: [{ metric: 'new_uncovered_conditions', value: String(2 - index) }]
  }));
  const outcome = await runConditions({
    config,
    reportWriter: conditionReports.writeReport,
    client: {
      get: async (endpoint, parameters) => {
        if (endpoint === '/api/measures/component_tree') {
          return {
            components,
            paging: { pageIndex: 1, pageSize: 500, total: components.length }
          };
        }
        if (parameters.key.endsWith('B.java')) {
          throw new Error('source endpoint failed');
        }
        return {
          sources: [{
            line: 1,
            code: 'if (ready && valid) {}',
            isNew: true,
            uncoveredConditions: 2
          }]
        };
      }
    }
  });

  assert.equal(outcome.status, 'incomplete');
  assert.equal(outcome.queries.find((query) => query.title === 'src/A.java').status, 'returned');
  assert.equal(outcome.queries.find((query) => query.title === 'src/B.java').status, 'error');
  const report = conditionReports.reports.get(OUTPUTS.conditions);
  assert.match(report, /Status: \*\*Incompleto\*\*/);
  assert.match(report, /src\/A\.java/);
  assert.match(report, /src\/B\.java/);
});
