const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toQuillHtml, containsHtml } = require('../src/rich-text');

// Clients that follow the documented format must never be double-converted.
test('passes existing HTML through untouched', () => {
    const html = '<p>Already <strong>formatted</strong></p><ul><li>One</li></ul>';
    assert.equal(toQuillHtml(html), html);
    assert.equal(containsHtml(html), true);
});

test('wraps plain text in paragraphs instead of one unformatted blob', () => {
    assert.equal(toQuillHtml('First para\n\nSecond para'), '<p>First para</p><p>Second para</p>');
});

test('converts inline emphasis', () => {
    assert.equal(toQuillHtml('**bold** and *italic* and ~~gone~~'),
        '<p><strong>bold</strong> and <em>italic</em> and <s>gone</s></p>');
});

test('converts headings up to h3', () => {
    assert.equal(toQuillHtml('# One\n## Two\n### Three'), '<h1>One</h1><h2>Two</h2><h3>Three</h3>');
});

test('converts bullet and numbered lists', () => {
    assert.equal(toQuillHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
    assert.equal(toQuillHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});

test('converts blockquotes and links', () => {
    assert.equal(toQuillHtml('> quoted'), '<blockquote>quoted</blockquote>');
    assert.equal(toQuillHtml('[site](https://kanbanzone.io)'),
        '<p><a href="https://kanbanzone.io">site</a></p>');
});

// <code> and <pre> are stripped by the server, so emitting them would lose the content silently.
test('renders code spans and fences as plain text, never as code or pre tags', () => {
    const span = toQuillHtml('use `npm test` now');
    assert.equal(span, '<p>use npm test now</p>');

    const fence = toQuillHtml('```\nline one\nline two\n```');
    assert.match(fence, /line one/);
    assert.doesNotMatch(fence, /<code>|<pre>/);
});

test('escapes stray angle brackets so user text cannot inject markup', () => {
    assert.equal(toQuillHtml('5 < 6 & 7 > 2'), '<p>5 &lt; 6 &amp; 7 &gt; 2</p>');
});

test('leaves empty or non-string values alone', () => {
    assert.equal(toQuillHtml(''), '');
    assert.equal(toQuillHtml(undefined), undefined);
});
