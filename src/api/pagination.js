'use strict';

class PaginationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaginationError';
  }
}

async function fetchAllPages({ fetchPage, itemKey, pageSize = 500 }) {
  const allItems = [];
  let expectedTotal;
  let page = 1;

  while (expectedTotal === undefined || allItems.length < expectedTotal) {
    const response = await fetchPage(page, pageSize);
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new PaginationError('Paged API response must be an object.');
    }

    const items = response[itemKey];
    const paging = response.paging;
    if (!Array.isArray(items) || !paging || typeof paging !== 'object') {
      throw new PaginationError(`Paged API response must include ${itemKey} and paging metadata.`);
    }
    if (!Number.isSafeInteger(paging.pageIndex) || paging.pageIndex !== page
      || !Number.isSafeInteger(paging.pageSize) || paging.pageSize <= 0
      || !Number.isSafeInteger(paging.total) || paging.total < 0) {
      throw new PaginationError(`Invalid pagination metadata on page ${page}.`);
    }
    if (paging.pageSize > pageSize || items.length > paging.pageSize || items.length > pageSize) {
      throw new PaginationError(`Page ${page} exceeds the supported page size.`);
    }
    if (expectedTotal === undefined) {
      expectedTotal = paging.total;
    } else if (paging.total !== expectedTotal) {
      throw new PaginationError(`Pagination total changed from ${expectedTotal} to ${paging.total}.`);
    }
    if (items.length === 0 && allItems.length < expectedTotal) {
      throw new PaginationError(`Page ${page} was empty before all ${expectedTotal} records were received.`);
    }

    allItems.push(...items);
    if (allItems.length > expectedTotal) {
      throw new PaginationError(`Received more records than the reported total of ${expectedTotal}.`);
    }
    page += 1;
  }

  if (allItems.length !== expectedTotal) {
    throw new PaginationError(`Received ${allItems.length} records; API reported ${expectedTotal}.`);
  }
  return allItems;
}

module.exports = { PaginationError, fetchAllPages };
