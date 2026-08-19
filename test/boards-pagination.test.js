const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const { initApiClient } = require('../src/client');
const { registerBoardsTools } = require('../src/tools/boards');

const handlerFor = name => {
    let handler;
    registerBoardsTools({
        registerTool: (toolName, definition, fn) => {
            if (toolName === name) handler = fn;
        },
    });
    return handler;
};

const fakeBoards = n =>
    Array.from({ length: n }, (_, i) => ({ BoardItem: { name: `Board ${i + 1}`, publicId: `id${i + 1}` } }));

// /boards has no server-side pagination, so the tool windows the list itself — an org with
// hundreds of boards would otherwise fill the caller's context in a single response.
test('list_boards windows results by page/count and reports the true total', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({ data: { count: 25, boards: fakeBoards(25) } }));

    const listBoards = handlerFor('kanbanzone_list_boards');
    const result = await listBoards({ page: 2, count: 10, response_format: 'json' });

    const payload = result.structuredContent;
    assert.equal(payload.total, 25);
    assert.equal(payload.page, 2);
    assert.equal(payload.count, 10);
    assert.equal(payload.has_more, true);
    assert.equal(payload.boards[0].BoardItem.publicId, 'id11');
    assert.equal(payload.boards.at(-1).BoardItem.publicId, 'id20');
});

test('list_boards reports has_more false on the final page', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({ data: { count: 25, boards: fakeBoards(25) } }));

    const listBoards = handlerFor('kanbanzone_list_boards');
    const result = await listBoards({ page: 3, count: 10, response_format: 'json' });

    assert.equal(result.structuredContent.has_more, false);
    assert.equal(result.structuredContent.boards.length, 5);
});

// structuredContent used to return every board even when the rendered text was truncated, so the
// full payload still reached the caller's context.
test('list_boards structuredContent is windowed, not the full list', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({ data: { count: 240, boards: fakeBoards(240) } }));

    const listBoards = handlerFor('kanbanzone_list_boards');
    const result = await listBoards({ page: 1, count: 20, response_format: 'markdown' });

    assert.equal(result.structuredContent.boards.length, 20);
    assert.equal(result.structuredContent.total, 240);
});
