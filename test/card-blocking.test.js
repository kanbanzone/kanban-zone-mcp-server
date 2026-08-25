const { test } = require('node:test');
const assert = require('node:assert/strict');

const { registerCardsTools } = require('../src/tools/cards');

const collectTools = register => {
    const tools = {};
    register({ registerTool: (name, definition) => { tools[name] = definition; } });
    return tools;
};

const tools = collectTools(registerCardsTools);

// Blocking is the signal behind WIP and flow KPIs, and the API supports it on the card update.
// Without these fields an assistant can read that a card is blocked but never clear the block.
test('update_card accepts a boolean blocked flag', () => {
    const field = tools.kanbanzone_update_card.inputSchema.blocked;
    assert.ok(field, 'kanbanzone_update_card has no blocked field');

    assert.equal(field.parse(true), true);
    assert.equal(field.parse(false), false);
    assert.equal(field.parse(undefined), undefined, 'blocked must be optional');
    assert.throws(() => field.parse('yes'), 'blocked must reject non-booleans');
});

test('update_card accepts a blockedReason string', () => {
    const field = tools.kanbanzone_update_card.inputSchema.blockedReason;
    assert.ok(field, 'kanbanzone_update_card has no blockedReason field');

    assert.equal(field.parse('waiting on vendor'), 'waiting on vendor');
    assert.equal(field.parse(undefined), undefined, 'blockedReason must be optional');
});

test('update_card documents blocking in its prose description', () => {
    assert.match(tools.kanbanzone_update_card.description, /blocked/);
});
