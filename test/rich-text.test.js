const { test } = require('node:test');
const assert = require('node:assert/strict');

const { registerCardsTools } = require('../src/tools/cards');
const { registerTasksTools } = require('../src/tools/tasks');
const { registerCommentsTools } = require('../src/tools/comments');

// Collects what each register* call would expose, so we can assert on the definitions a client sees.
const collectTools = register => {
    const tools = {};
    register({ registerTool: (name, definition) => { tools[name] = definition; } });
    return tools;
};

const tools = {
    ...collectTools(registerCardsTools),
    ...collectTools(registerTasksTools),
    ...collectTools(registerCommentsTools),
};

// Content fields are stored as HTML by the Quill editor. Without an explicit format spec, LLM
// clients send plain text or markdown and the content renders as one unformatted paragraph.
const CONTENT_FIELDS = [
    ['kanbanzone_create_card', 'description'],
    ['kanbanzone_update_card', 'description'],
    ['kanbanzone_create_task', 'description'],
    ['kanbanzone_update_task', 'description'],
    ['kanbanzone_create_comment', 'text'],
];

for (const [toolName, field] of CONTENT_FIELDS) {
    test(`${toolName}.${field} states the HTML content format in its schema`, () => {
        const definition = tools[toolName];
        assert.ok(definition, `${toolName} is not registered`);

        const described = definition.inputSchema[field].description;
        assert.ok(described, `${toolName}.${field} has no schema description`);
        assert.match(described, /HTML/);
        assert.match(described, /<p>/);
        // <code> and <pre> are stripped by the server's sanitizer, so they must not be recommended.
        assert.match(described, /Do not use <code> or <pre>/);
    });

    test(`${toolName} documents the ${field} format in its prose description too`, () => {
        assert.match(tools[toolName].description, /HTML, not markdown or plain text/);
    });
}
