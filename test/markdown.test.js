const { test } = require('node:test');
const assert = require('node:assert');
const { markdownToHtml, richTextBody, containsHtml } = require('../src/markdown');

// The API validates `required|string` on comment text and task description, so every rich-text
// field must be sent as an HTML string — a delta-only body is rejected outright.
test('richTextBody always sends the string field, never a delta field', () => {
    assert.deepEqual(Object.keys(richTextBody('text', 'plain words')), ['text']);
    assert.deepEqual(Object.keys(richTextBody('description', '## heading')), ['description']);
    assert.deepEqual(Object.keys(richTextBody('description', '<p>html</p>')), ['description']);
});

test('renders inline markers', () => {
    assert.equal(markdownToHtml('a **b** *c* ~~d~~ `e`'),
        '<p>a <strong>b</strong> <em>c</em> <s>d</s> <code>e</code></p>');
});

test('code spans protect their contents from other markers', () => {
    assert.equal(markdownToHtml('run `a_b_c`'), '<p>run <code>a_b_c</code></p>');
});

test('renders headings, quotes and lists', () => {
    assert.equal(markdownToHtml('## Title'), '<h2>Title</h2>');
    assert.equal(markdownToHtml('> quoted'), '<blockquote>quoted</blockquote>');
    assert.equal(markdownToHtml('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
    assert.equal(markdownToHtml('1. first'), '<ol><li>first</li></ol>');
});

test('renders a fence as one <pre> keeping newlines', () => {
    assert.equal(markdownToHtml('```\nnpm test\nnpm run lint\n```'), '<pre>npm test\nnpm run lint</pre>');
});

test('escapes markup so user text cannot inject tags', () => {
    assert.equal(markdownToHtml('5 < 6 & 7 > 2'), '<p>5 &lt; 6 &amp; 7 &gt; 2</p>');
    assert.equal(markdownToHtml('```\n<b>x</b>\n```'), '<pre>&lt;b&gt;x&lt;/b&gt;</pre>');
});

test('passes existing HTML through untouched', () => {
    const html = '<p>Intro</p><ul><li>One</li></ul>';
    assert.equal(markdownToHtml(html), html);
    assert.ok(containsHtml('<pre>x</pre>'));
    assert.ok(!containsHtml('5 < 6'));
});

test('links survive', () => {
    assert.equal(markdownToHtml('[site](https://kanbanzone.io)'),
        '<p><a href="https://kanbanzone.io">site</a></p>');
});

// create_checklist sends tasks[] as plain strings on the API — it was the one rich-text path
// that never converted markdown, so checklist tasks stored literal `code` and **bold**.
test('create_checklist converts markdown in every task description', async t => {
    const axios = require('axios');
    const { initApiClient } = require('../src/client');
    const { registerChecklistsTools } = require('../src/tools/checklists');

    process.env.KANBANZONE_API_KEY = 'a:b';
    initApiClient();
    let sent;
    t.mock.method(axios, 'request', async cfg => {
        sent = cfg.data;
        return { data: { _id: 'c1', tasks: [{}, {}] } };
    });

    let handler;
    registerChecklistsTools({
        registerTool: (name, def, fn) => {
            if (name === 'kanbanzone_create_checklist') handler = fn;
        },
    });

    await handler({
        card: 'a1b2c3d4e5f6a7b8c9d0e1f2',
        tasks: [{ description: 'first with `code`' }, { description: 'second with **bold**' }],
    });

    assert.equal(sent.tasks[0].description, '<p>first with <code>code</code></p>');
    assert.equal(sent.tasks[1].description, '<p>second with <strong>bold</strong></p>');
});
