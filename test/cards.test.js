const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderCardLine, summarizeListResponse } = require('../src/tools/cards');

// --- renderCardLine: list_cards nests fields under CardItem; search_cards returns them flat.
// The shared renderer must handle both, or list titles render as `undefined` (the reported bug).

test('renderCardLine reads title/number/owner from the CardItem wrapper (list_cards shape)', () => {
    const line = renderCardLine({
        _id: '62fb7423cffc0018838d19',
        CardItem: { number: 49, title: 'Product - Dimitri', owner: 'dimitri@kanbanzone.com' },
    });
    assert.equal(
        line,
        '- #49 **Product - Dimitri** (`62fb7423cffc0018838d19`) — owner dimitri@kanbanzone.com'
    );
});

test('renderCardLine still renders flat cards (search_cards shape)', () => {
    const line = renderCardLine({ _id: 'abc', number: 12, title: 'Flat card' });
    assert.equal(line, '- #12 **Flat card** (`abc`)');
});

test('renderCardLine omits the owner suffix when there is no owner', () => {
    const line = renderCardLine({ _id: 'x', CardItem: { number: 5, title: 'No owner', owner: null } });
    assert.equal(line, '- #5 **No owner** (`x`)');
});

// --- summarizeListResponse: the /cards list envelope is { count, totalAvailable, cards, hasMore }.
// The old code read data.total (undefined) and recomputed has_more, collapsing total to the page size.

test('summarizeListResponse uses the backend totalAvailable and hasMore (list envelope)', () => {
    const data = {
        count: 20,
        totalAvailable: 137,
        cards: [{ _id: '1' }, { _id: '2' }],
        hasMore: true,
    };
    const { items, total, hasMore } = summarizeListResponse(data, 1, 20);
    assert.equal(total, 137);
    assert.equal(hasMore, true);
    assert.equal(items.length, 2);
});

test('summarizeListResponse falls back to items.length and computed hasMore for a bare array', () => {
    const data = [{ _id: '1' }, { _id: '2' }, { _id: '3' }];
    const { items, total, hasMore } = summarizeListResponse(data, 1, 3);
    assert.equal(total, 3);
    assert.equal(hasMore, false);
    assert.equal(items.length, 3);
});

test('summarizeListResponse also honors search-style total/has_more names', () => {
    const data = { total: 50, has_more: true, items: [{ _id: '1' }] };
    const { total, hasMore } = summarizeListResponse(data, 1, 20);
    assert.equal(total, 50);
    assert.equal(hasMore, true);
});
