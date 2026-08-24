// Converts the markdown LLM clients naturally produce into the HTML the API accepts.
//
// The public API takes rich text as an HTML string — POST /comments, POST /tasks and the
// checklist tasks[] all validate `required|string` on it — so markdown must become HTML here
// rather than a delta. The server converts that HTML to its stored delta (utils/quill.js),
// which preserves inline <code> and multi-line <pre> as of 8.8.0.
//
// Input that already contains HTML is returned untouched, so a client following the documented
// format is never double-converted.

const SUPPORTED_TAG = /<(?:p|br|strong|em|u|s|a|ul|ol|li|h[1-3]|blockquote|pre|code)\b[^>]*>/i;
const containsHtml = text => SUPPORTED_TAG.test(text);

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderMarkers = text =>
    text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^_])_([^_\s][^_]*)_/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<s>$1</s>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

// Code spans are split out before the other markers so they cannot mangle their contents —
// `run_a_test` is a name, not italics.
const renderInline = text =>
    escapeHtml(text)
        .split(/(`[^`]+`)/)
        .map(part =>
            part.length > 2 && part.startsWith('`') && part.endsWith('`')
                ? `<code>${part.slice(1, -1)}</code>`
                : renderMarkers(part)
        )
        .join('');

const UNORDERED = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

const markdownToHtml = value => {
    if (typeof value !== 'string' || !value.trim()) return value;
    if (containsHtml(value)) return value;

    const lines = value.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null;
    let paragraph = [];
    let fenced = false;
    let fence = [];

    const closeList = () => {
        if (list) {
            out.push(`</${list}>`);
            list = null;
        }
    };
    const closeParagraph = () => {
        if (paragraph.length) {
            out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
            paragraph = [];
        }
    };
    const closeFence = () => {
        out.push(`<pre>${fence.map(escapeHtml).join('\n')}</pre>`);
        fence = [];
    };
    const openList = kind => {
        if (list !== kind) {
            closeList();
            out.push(`<${kind}>`);
            list = kind;
        }
    };

    for (const line of lines) {
        if (FENCE.test(line)) {
            closeParagraph();
            closeList();
            if (fenced) closeFence();
            fenced = !fenced;
            continue;
        }
        if (fenced) {
            fence.push(line);
            continue;
        }
        if (!line.trim()) {
            closeParagraph();
            closeList();
            continue;
        }

        const heading = line.match(HEADING);
        if (heading) {
            closeParagraph();
            closeList();
            out.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
            continue;
        }

        const quote = line.match(QUOTE);
        if (quote) {
            closeParagraph();
            closeList();
            out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
            continue;
        }

        const unordered = line.match(UNORDERED);
        const ordered = unordered ? null : line.match(ORDERED);
        if (unordered || ordered) {
            closeParagraph();
            openList(unordered ? 'ul' : 'ol');
            out.push(`<li>${renderInline((unordered || ordered)[2])}</li>`);
            continue;
        }

        paragraph.push(line.trim());
    }

    closeParagraph();
    closeList();
    // An unterminated fence still carries its lines.
    if (fenced && fence.length) closeFence();
    return out.join('');
};

// Every rich-text field on the API is an HTML string; markdown is converted, HTML passes through.
const richTextBody = (field, value) => ({ [field]: markdownToHtml(value) });

module.exports = { markdownToHtml, richTextBody, containsHtml };
