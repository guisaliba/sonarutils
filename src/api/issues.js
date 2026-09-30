'use strict';

const { fetchAllPages } = require('./pagination');

const ISSUE_PAGE_SIZE = 500;

const ISSUE_QUERIES = Object.freeze([
  Object.freeze({
    id: 'all-unresolved',
    title: 'Todos os issues não resolvidos',
    filters: Object.freeze({ resolved: 'false' })
  }),
  Object.freeze({
    id: 'new-code-smells',
    title: 'Code smells não resolvidos em código novo',
    filters: Object.freeze({
      resolved: 'false',
      types: 'CODE_SMELL',
      inNewCodePeriod: 'true'
    })
  }),
  Object.freeze({
    id: 'unresolved-bugs',
    title: 'Bugs não resolvidos',
    filters: Object.freeze({ resolved: 'false', types: 'BUG' })
  }),
  Object.freeze({
    id: 'unresolved-vulnerabilities',
    title: 'Vulnerabilidades não resolvidas',
    filters: Object.freeze({ resolved: 'false', types: 'VULNERABILITY' })
  })
]);

async function getAllIssues(client, project, query) {
  return fetchAllPages({
    itemKey: 'issues',
    pageSize: ISSUE_PAGE_SIZE,
    fetchPage: (page, pageSize) => client.get('/api/issues/search', {
      componentKeys: project,
      ...query.filters,
      p: page,
      ps: pageSize
    })
  });
}

module.exports = { ISSUE_PAGE_SIZE, ISSUE_QUERIES, getAllIssues };
