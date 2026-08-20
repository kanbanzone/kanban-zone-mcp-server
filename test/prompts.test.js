const { test } = require('node:test');
const assert = require('node:assert');

const { registerAllPrompts } = require('../src/prompts');

const collect = () => {
    const prompts = {};
    registerAllPrompts({
        registerPrompt: (name, definition, callback) => {
            prompts[name] = { definition, callback };
        },
    });
    return prompts;
};

const textOf = async (prompts, name, args) => {
    const result = await prompts[name].callback(args);
    return result.messages.map(m => m.content.text).join('\n');
};

test('registers the three prompts with titles and argument schemas', () => {
    const prompts = collect();
    assert.deepEqual(Object.keys(prompts).sort(), ['board_review', 'checklist_generator', 'standup_summary']);
    for (const name of Object.keys(prompts)) {
        assert.ok(prompts[name].definition.title, `${name} has a title`);
        assert.ok(prompts[name].definition.argsSchema, `${name} has arguments`);
    }
});

test('board_review references the real tool contract', async () => {
    const prompts = collect();
    const text = await textOf(prompts, 'board_review', { board: 'OeMrbG8g' });
    assert.match(text, /kanbanzone_list_board_columns/);
    assert.match(text, /ColumnItem\.maxWIP/);
    assert.match(text, /count: 100/);
    assert.match(text, /kanbanzone_get_card_metrics/);
    assert.match(text, /more than 7 days/);
    assert.doesNotMatch(text, /undefined/);
});

test('board_review honors a custom aging threshold', async () => {
    const prompts = collect();
    const text = await textOf(prompts, 'board_review', { board: 'OeMrbG8g', aging_days: '14' });
    assert.match(text, /more than 14 days/);
});

test('checklist_generator batches tasks and requires confirmation before writing', async () => {
    const prompts = collect();
    const text = await textOf(prompts, 'checklist_generator', { card: 'a1b2c3d4e5f6a7b8c9d0e1f2' });
    assert.match(text, /kanbanzone_get_card/);
    assert.match(text, /kanbanzone_create_checklist/);
    assert.match(text, /tasks array/);
    assert.match(text, /GIVEN\/WHEN\/THEN/);
    assert.match(text, /Do not write to the card before confirmation/);
    assert.doesNotMatch(text, /kanbanzone_create_task/);
    assert.doesNotMatch(text, /undefined/);
});

test('standup_summary preselects from the list and uses history start', async () => {
    const prompts = collect();
    const text = await textOf(prompts, 'standup_summary', { board: 'OeMrbG8g' });
    assert.match(text, /kanbanzone_list_cards/);
    assert.match(text, /blockedReason/);
    assert.match(text, /kanbanzone_get_card_history/);
    assert.match(text, /start/);
    assert.match(text, /48 hours/);
    assert.doesNotMatch(text, /undefined/);
});
