'use strict';

class ResponseSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResponseSchemaError';
  }
}

function isValue(value) {
  return (typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isFinite(value));
}

function readMeasureValue(measure, metric) {
  if (metric.startsWith('new_')) {
    if (measure.period !== undefined && measure.period !== null) {
      if (measure.period.index !== undefined && measure.period.index !== 1) {
        throw new ResponseSchemaError(`Measure ${metric} did not include the new-code period.`);
      }
      if (isValue(measure.period.value)) {
        return { value: measure.period.value, periodIndex: measure.period.index };
      }
      if (measure.period.bestValue === true) {
        return { value: undefined, periodIndex: measure.period.index, bestValue: true };
      }
      throw new ResponseSchemaError(`Measure ${metric} did not include the new-code period value.`);
    }
    if (Array.isArray(measure.periods)) {
      const period = measure.periods.find((candidate) => candidate && candidate.index === 1);
      if (period && isValue(period.value)) {
        return { value: period.value, periodIndex: period.index };
      }
      if (period && period.bestValue === true) {
        return { value: undefined, periodIndex: period.index, bestValue: true };
      }
      throw new ResponseSchemaError(`Measure ${metric} did not include an unambiguous new-code period value.`);
    }
  }
  if (isValue(measure.value)) {
    return { value: measure.value, periodIndex: undefined, bestValue: false };
  }
  if (measure.bestValue === true) {
    return { value: undefined, periodIndex: undefined, bestValue: true };
  }
  throw new ResponseSchemaError(`Measure ${metric} did not include a value.`);
}

function parseMeasureResponse(response, metric) {
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || !response.component || typeof response.component !== 'object'
    || !Array.isArray(response.component.measures)) {
    throw new ResponseSchemaError('Measures response must include component.measures.');
  }

  const matches = response.component.measures.filter((measure) => measure && measure.metric === metric);
  if (matches.length > 1) {
    throw new ResponseSchemaError(`Measures response contained duplicate entries for ${metric}.`);
  }
  if (matches.length === 0) {
    return { found: false };
  }
  return { found: true, ...readMeasureValue(matches[0], metric) };
}

async function getProjectMeasure(client, project, metric) {
  const response = await client.get('/api/measures/component', {
    component: project,
    metricKeys: metric,
    additionalFields: 'periods'
  });
  return parseMeasureResponse(response, metric);
}

function readNumericMeasure(measure, metric) {
  const parsed = readMeasureValue(measure, metric);
  if (parsed.bestValue || parsed.value === undefined) {
    throw new ResponseSchemaError(`Measure ${metric} did not include a numeric value.`);
  }
  const value = Number(parsed.value);
  if (!Number.isFinite(value)) {
    throw new ResponseSchemaError(`Measure ${metric} was not numeric.`);
  }
  return { value, periodIndex: parsed.periodIndex };
}

module.exports = {
  ResponseSchemaError,
  getProjectMeasure,
  parseMeasureResponse,
  readMeasureValue,
  readNumericMeasure
};
