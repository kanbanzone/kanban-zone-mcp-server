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

// Card descriptions, comments and task text are stored as Quill deltas. Markdown is converted to
// a delta client-side before sending; strings containing HTML tags are passed through unchanged
// for the server to convert.
const RICH_TEXT_HELP =
    'Markdown (preferred) or HTML. Markdown is converted to the stored rich-text format; strings ' +
    'containing HTML tags are passed through unchanged.';

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
