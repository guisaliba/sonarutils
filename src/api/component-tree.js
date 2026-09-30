'use strict';

const { fetchAllPages } = require('./pagination');
const { ResponseSchemaError } = require('./measures');

const COMPONENT_TREE_PAGE_SIZE = 500;

async function getLeafComponents(client, project) {
  return fetchAllPages({
    itemKey: 'components',
    pageSize: COMPONENT_TREE_PAGE_SIZE,
    fetchPage: (page, pageSize) => client.get('/api/measures/component_tree', {
      component: project,
      metricKeys: 'new_uncovered_conditions,new_branch_coverage',
      qualifiers: 'FIL',
      strategy: 'leaves',
      additionalFields: 'metrics,periods',
      p: page,
      ps: pageSize
    })
  });
}

function getComponentMetric(component, metric) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new ResponseSchemaError('Component tree entry must be an object.');
  }
  if (component.measures === undefined) {
    return undefined;
  }
  if (!Array.isArray(component.measures)) {
    throw new ResponseSchemaError('Component measures must be an array.');
  }
  const matches = component.measures.filter((measure) => measure && measure.metric === metric);
  if (matches.length > 1) {
    throw new ResponseSchemaError(`Component contained duplicate ${metric} measures.`);
  }
  return matches[0];
}

module.exports = { COMPONENT_TREE_PAGE_SIZE, getComponentMetric, getLeafComponents };
