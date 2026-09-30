'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchAllPages } = require('../src/api/pagination');

test('fetches all pages and checks the received count against API metadata', async () => {
  const requested = [];
  const items = await fetchAllPages({
    itemKey: 'issues',
    pageSize: 2,
    fetchPage: async (page, size) => {
      requested.push([page, size]);
      return {
        issues: page === 1 ? ['a', 'b'] : ['c'],
        paging: { pageIndex: page, pageSize: size, total: 3 }
      };
    }
  });
  assert.deepEqual(requested, [[1, 2], [2, 2]]);
  assert.deepEqual(items, ['a', 'b', 'c']);
});

test('fails a later page without returning the earlier partial rows', async () => {
  const received = [];
  await assert.rejects(fetchAllPages({
    itemKey: 'issues',
    pageSize: 1,
    fetchPage: async (page) => {
      if (page === 2) {
        throw new Error('page two failed');
      }
      received.push('partial');
      return { issues: ['partial'], paging: { pageIndex: 1, pageSize: 1, total: 2 } };
    }
  }), /page two failed/);
  assert.deepEqual(received, ['partial']);
});

test('rejects empty pages, invalid metadata, and inconsistent totals before completion', async (t) => {
  await t.test('empty page', async () => {
    await assert.rejects(fetchAllPages({
      itemKey: 'components',
      pageSize: 2,
      fetchPage: async () => ({
        components: [],
        paging: { pageIndex: 1, pageSize: 2, total: 1 }
      })
    }), /empty before/);
  });

  await t.test('invalid page index', async () => {
    await assert.rejects(fetchAllPages({
      itemKey: 'issues',
      pageSize: 2,
      fetchPage: async () => ({
        issues: ['one'],
        paging: { pageIndex: 2, pageSize: 2, total: 1 }
      })
    }), /Invalid pagination metadata/);
  });

  await t.test('inconsistent total', async () => {
    await assert.rejects(fetchAllPages({
      itemKey: 'issues',
      pageSize: 1,
      fetchPage: async (page) => ({
        issues: [String(page)],
        paging: { pageIndex: page, pageSize: 1, total: page === 1 ? 2 : 3 }
      })
    }), /total changed/);
  });
});
