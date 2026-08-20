// Converts the markdown LLM clients naturally produce into a Quill Delta, so the API receives the
// stored format directly. Inline: `code`, **bold**, __bold__, *em*, _em_, ~~strike~~, [text](url).
// Blocks: #-### headings, -/*/+ and 1. lists (2-space nesting -> indent), > quotes, ``` fences ->
// code-block lines, blank-line paragraph breaks. Input that already contains HTML is passed through
// in the plain field for the server to convert (richTextBody).

const SUPPORTED_TAG = /<(?:p|br|strong|em|u|s|a|ul|ol|li|h[1-3]|blockquote|pre|code)\b[^>]*>/i;
const containsHtml = text => SUPPORTED_TAG.test(text);

const INLINE_TOKEN =
    /(`[^`]+`)|(\*\*[^*]+?\*\*)|(__[^_]+?__)|(~~[^~]+?~~)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|((?<![\w*])\*[^*\s][^*]*?\*(?![\w*]))|((?<![\w_])_[^_\s][^_]*?_(?![\w_]))/;

const runsFromText = text => {
    const runs = [];
    let rest = text;
    while (rest) {
        const match = rest.match(INLINE_TOKEN);
        if (!match) {
            runs.push({ insert: rest });
            break;
        }
        if (match.index > 0) runs.push({ insert: rest.slice(0, match.index) });
        const token = match[0];
        if (match[1]) runs.push({ insert: token.slice(1, -1), attributes: { code: true } });
        else if (match[2] || match[3]) runs.push({ insert: token.slice(2, -2), attributes: { bold: true } });
        else if (match[4]) runs.push({ insert: token.slice(2, -2), attributes: { strike: true } });
        else if (match[5]) runs.push({ insert: match[6], attributes: { link: match[7] } });
        else runs.push({ insert: token.slice(1, -1), attributes: { italic: true } });
        rest = rest.slice(match.index + token.length);
    }
    return runs;
};

const markdownToDelta = markdown => {
    const ops = [];
    const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
    let paragraph = [];
    let fenced = false;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        ops.push(...runsFromText(paragraph.join(' ')), { insert: '\n' });
        paragraph = [];
    };

    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            flushParagraph();
            fenced = !fenced;
            continue;
        }
        if (fenced) {
            if (line) ops.push({ insert: line });
            ops.push({ insert: '\n', attributes: { 'code-block': true } });
            continue;
        }
        if (!line.trim()) {
            flushParagraph();
            continue;
        }
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            flushParagraph();
            ops.push(...runsFromText(heading[2]), { insert: '\n', attributes: { header: heading[1].length } });
            continue;
        }
        const quote = line.match(/^>\s?(.*)$/);
        if (quote) {
            flushParagraph();
            ops.push(...runsFromText(quote[1]), { insert: '\n', attributes: { blockquote: true } });
            continue;
        }
        const unordered = line.match(/^(\s*)[-*+]\s+(.*)$/);
        const ordered = unordered ? null : line.match(/^(\s*)\d+[.)]\s+(.*)$/);
        if (unordered || ordered) {
            flushParagraph();
            const [, lead, text] = unordered || ordered;
            const attributes = { list: unordered ? 'bullet' : 'ordered' };
            const indent = Math.min(Math.floor(lead.length / 2), 8);
            if (indent) attributes.indent = indent;
            ops.push(...runsFromText(text), { insert: '\n', attributes });
            continue;
        }
        paragraph.push(line.trim());
    }
    flushParagraph();
    return ops.length ? { ops } : { ops: [{ insert: '\n' }] };
};

// HTML goes through unchanged for the server to convert; anything else is markdown.
const richTextBody = (field, value) =>
    containsHtml(value) ? { [field]: value } : { [`${field}Delta`]: markdownToDelta(value) };

module.exports = { markdownToDelta, richTextBody, containsHtml };
