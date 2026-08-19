const { z } = require('zod');
const { CHARACTER_LIMIT } = require('./constants');

const ResponseFormat = {
    MARKDOWN: 'markdown',
    JSON: 'json',
};

const responseFormatField = z
    .enum([ResponseFormat.MARKDOWN, ResponseFormat.JSON])
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format. 'markdown' (default) is human-readable; 'json' is the raw structured payload.");

// Card descriptions, comments and task text are stored as HTML by the Quill editor. Plain text
// collapses into a single unformatted paragraph and markdown is shown literally, so callers have to
// send real tags. The supported list is what the server's sanitizer actually preserves — verified
// against it; <code> and <pre> are excluded because it strips them today.
const RICH_TEXT_HELP =
    'HTML, not markdown or plain text. Plain text renders as one unformatted paragraph and markdown ' +
    'is shown literally. Wrap every paragraph in <p>. Supported: <p>, <strong>, <em>, <u>, <s>, ' +
    '<a href>, <ul>/<ol> with <li> (nesting allowed), <h1>-<h3>, <blockquote>. Do not use <code> or ' +
    '<pre> — the server strips them. Example: <p>Intro</p><ul><li>One</li><li>Two</li></ul>';

const toJsonString = value => JSON.stringify(value, null, 2);

// Caller passes the full rendered string and a `rerender(items)` callback so we can
// shrink the items array and re-render until we're under CHARACTER_LIMIT.
const truncateIfNeeded = ({ items, rendered, rerender }) => {
    if (rendered.length <= CHARACTER_LIMIT) {
        return { text: rendered, truncated: false, keptCount: items.length };
    }

    let kept = Math.max(1, Math.floor(items.length / 2));
    let next = rerender(items.slice(0, kept));
    while (next.length > CHARACTER_LIMIT && kept > 1) {
        kept = Math.max(1, Math.floor(kept / 2));
        next = rerender(items.slice(0, kept));
    }

    const note =
        `\n\n> Response truncated from ${items.length} to ${kept} items to stay under ${CHARACTER_LIMIT} characters. ` +
        `Use pagination (\`page\`/\`count\`) or narrower filters to see the rest.`;
    return { text: next + note, truncated: true, keptCount: kept };
};

module.exports = {
    RICH_TEXT_HELP,
    ResponseFormat,
    responseFormatField,
    toJsonString,
    truncateIfNeeded,
};
