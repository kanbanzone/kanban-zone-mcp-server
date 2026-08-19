// Converts the markdown LLM clients naturally produce into the HTML the Quill editor stores.
//
// Only the tags the server's sanitizer actually preserves are emitted — verified against it:
// <p> <strong> <em> <u> <s> <a href> <ul>/<ol> + <li> <h1>-<h3> <blockquote>. Notably <code> and
// <pre> are stripped server-side, so code spans and fences are rendered as plain text rather than
// silently losing their content's formatting.
//
// Input that already contains HTML is returned untouched, so a client following the documented
// format (see RICH_TEXT_HELP) is never double-converted.

const SUPPORTED_TAG = /<(?:p|br|strong|em|u|s|a|ul|ol|li|h[1-3]|blockquote)\b[^>]*>/i;

const containsHtml = text => SUPPORTED_TAG.test(text);

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline markers, applied after escaping so user text can never inject tags.
const renderInline = text =>
    escapeHtml(text)
        .replace(/`([^`]+)`/g, '$1') // <code> is stripped server-side; keep the text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^_])_([^_\s][^_]*)_/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<s>$1</s>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^\s*```/;

const toQuillHtml = value => {
    if (typeof value !== 'string' || !value.trim()) return value;
    if (containsHtml(value)) return value;

    const lines = value.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null; // 'ul' | 'ol'
    let paragraph = [];
    let fenced = false;

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
    const openList = kind => {
        if (list !== kind) {
            closeList();
            out.push(`<${kind}>`);
            list = kind;
        }
    };

    for (const line of lines) {
        // Fences carry no supported tag; emit their contents as ordinary paragraphs.
        if (FENCE.test(line)) {
            closeParagraph();
            closeList();
            fenced = !fenced;
            continue;
        }
        if (fenced) {
            if (line.trim()) out.push(`<p>${escapeHtml(line)}</p>`);
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
            out.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
            continue;
        }

        paragraph.push(line.trim());
    }

    closeParagraph();
    closeList();
    return out.join('');
};

module.exports = { toQuillHtml, containsHtml };
