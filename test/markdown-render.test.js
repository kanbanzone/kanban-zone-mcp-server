const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const { initApiClient } = require('../src/client');
const { registerBoardsTools } = require('../src/tools/boards');
const { registerCardsTools } = require('../src/tools/cards');

const handlerFor = (register, name) => {
    let handler;
    register({
        registerTool: (toolName, definition, fn) => {
            if (toolName === name) handler = fn;
        },
    });
    return handler;
};

// The API wraps entities ({ BoardItem }, { CardItem }) — the markdown renderers must
// unwrap them or every line reads "undefined" (JSON mode was fine, markdown was not).
test('list_boards markdown renders board names, not undefined', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({
        data: { boards: [{ BoardItem: { name: 'Roadmap', publicId: 'd8lrbc8a' } }] },
    }));

    const listBoards = handlerFor(registerBoardsTools, 'kanbanzone_list_boards');
    const result = await listBoards({ page: 1, count: 20, response_format: 'markdown' });
    const text = result.content[0].text;
    assert.match(text, /\*\*Roadmap\*\* \(d8lrbc8a\)/);
    assert.doesNotMatch(text, /undefined/);
});

test('get_board markdown renders the board name from the wrapped envelope', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({
        data: { boards: [{ BoardItem: { name: 'Roadmap', publicId: 'd8lrbc8a' } }] },
    }));

    const getBoard = handlerFor(registerBoardsTools, 'kanbanzone_get_board');
    const result = await getBoard({ board: 'd8lrbc8a', response_format: 'markdown' });
    const text = result.content[0].text;
    assert.match(text, /# Roadmap/);
    assert.doesNotMatch(text, /undefined/);
});

test('list_board_columns markdown unwraps ColumnItem and shows WIP limits', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({
        data: [
            { ColumnItem: { columnId: 'col1', title: 'In Progress', columnState: 'In Progress', minWIP: 1, maxWIP: 4 } },
            { ColumnItem: { columnId: 'col2', title: 'Backlog', columnState: 'Backlog', minWIP: null, maxWIP: null } },
        ],
    }));

    const listColumns = handlerFor(registerBoardsTools, 'kanbanzone_list_board_columns');
    const result = await listColumns({ board: 'OeMrbG8g', response_format: 'markdown' });
    const text = result.content[0].text;
    assert.match(text, /\*\*In Progress\*\* \(`col1`\).*WIP 1-4/);
    assert.match(text, /\*\*Backlog\*\* \(`col2`\)/);
    assert.doesNotMatch(text, /undefined/);
});

test('list_board_labels markdown uses the flat id field', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({
        data: [{ id: 'label1', color: '#ff0000', description: 'Bug', position: 0 }],
    }));

    const listLabels = handlerFor(registerBoardsTools, 'kanbanzone_list_board_labels');
    const result = await listLabels({ board: 'OeMrbG8g', response_format: 'markdown' });
    const text = result.content[0].text;
    assert.match(text, /\*\*Bug\*\* \(`label1`\)/);
    assert.doesNotMatch(text, /undefined/);
});

test('create_card confirmation names the created card, not undefined', async t => {
    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    t.mock.method(axios, 'request', async () => ({
        data: {
            cards: [{ _id: 'a1b2c3d4e5f6a7b8c9d0e1f2', CardItem: { title: 'Huisman POC', number: 28225 } }],
            cardsAdded: 1,
            errors: [],
        },
    }));

    const createCard = handlerFor(registerCardsTools, 'kanbanzone_create_card');
    const result = await createCard({ board: 'OeMrbG8g', title: 'Huisman POC' });
    const text = result.content[0].text;
    assert.match(text, /Huisman POC/);
    assert.match(text, /a1b2c3d4e5f6a7b8c9d0e1f2/);
    assert.doesNotMatch(text, /undefined/);
});
