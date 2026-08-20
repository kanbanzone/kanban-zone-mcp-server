const { test } = require('node:test');
const assert = require('node:assert');
const { markdownToDelta, richTextBody, containsHtml } = require('../src/markdown-delta');

test('plain text becomes a paragraph delta', () => {
    assert.deepEqual(markdownToDelta('hello world'), { ops: [{ insert: 'hello world' }, { insert: '\n' }] });
});

test('inline formatting produces attributed runs', () => {
    assert.deepEqual(markdownToDelta('a **b** *c* ~~d~~ `e`').ops, [
        { insert: 'a ' },
        { insert: 'b', attributes: { bold: true } },
        { insert: ' ' },
        { insert: 'c', attributes: { italic: true } },
        { insert: ' ' },
        { insert: 'd', attributes: { strike: true } },
        { insert: ' ' },
        { insert: 'e', attributes: { code: true } },
        { insert: '\n' },
    ]);
});

test('underscores inside identifiers are not italics', () => {
    assert.deepEqual(markdownToDelta('run a_b_c now').ops, [{ insert: 'run a_b_c now' }, { insert: '\n' }]);
});

test('code spans protect their content from other markers', () => {
    assert.deepEqual(markdownToDelta('use `x**y**z`').ops, [
        { insert: 'use ' },
        { insert: 'x**y**z', attributes: { code: true } },
        { insert: '\n' },
    ]);
});

test('links carry the url as an attribute', () => {
    assert.deepEqual(markdownToDelta('[site](https://kanbanzone.io)').ops, [
        { insert: 'site', attributes: { link: 'https://kanbanzone.io' } },
        { insert: '\n' },
    ]);
});

test('headings, quotes, and lists set block attributes on the newline', () => {
    assert.deepEqual(markdownToDelta('## Title').ops, [{ insert: 'Title' }, { insert: '\n', attributes: { header: 2 } }]);
    assert.deepEqual(markdownToDelta('> quoted').ops, [{ insert: 'quoted' }, { insert: '\n', attributes: { blockquote: true } }]);
    assert.deepEqual(markdownToDelta('- one\n  - nested').ops, [
        { insert: 'one' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'nested' },
        { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
    ]);
    assert.deepEqual(markdownToDelta('1. first').ops, [{ insert: 'first' }, { insert: '\n', attributes: { list: 'ordered' } }]);
});

test('fences become code-block lines with newlines intact', () => {
    assert.deepEqual(markdownToDelta('```\nnpm test\nnpm run lint\n```').ops, [
        { insert: 'npm test' },
        { insert: '\n', attributes: { 'code-block': true } },
        { insert: 'npm run lint' },
        { insert: '\n', attributes: { 'code-block': true } },
    ]);
});

test('blank lines split paragraphs; consecutive lines join', () => {
    assert.deepEqual(markdownToDelta('one\ntwo\n\nthree').ops, [
        { insert: 'one two' },
        { insert: '\n' },
        { insert: 'three' },
        { insert: '\n' },
    ]);
});

test('richTextBody routes html to the html field and markdown to the delta field', () => {
    assert.deepEqual(richTextBody('description', '<p>html</p>'), { description: '<p>html</p>' });
    assert.deepEqual(richTextBody('description', '**md**'), {
        descriptionDelta: { ops: [{ insert: 'md', attributes: { bold: true } }, { insert: '\n' }] },
    });
    assert.deepEqual(richTextBody('text', 'plain'), { textDelta: { ops: [{ insert: 'plain' }, { insert: '\n' }] } });
});

test('containsHtml recognises the supported tag set including pre and code', () => {
    assert.ok(containsHtml('<pre>x</pre>'));
    assert.ok(containsHtml('<code>x</code>'));
    assert.ok(!containsHtml('5 < 6 and 7 > 2'));
});
