const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString, truncateIfNeeded, RICH_TEXT_HELP } = require('../format');
const { toQuillHtml } = require('../rich-text');
const { objectIdField } = require('../schemas');

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const renderComment = comment => {
    const author = comment.author && (comment.author.email || comment.author._id);
    const when = comment.createdAt ? ` _${comment.createdAt}_` : '';
    const body = comment.text || comment.body || '';
    return `- **${author || 'unknown'}**${when}: ${body}`;
};

const registerCommentsTools = server => {
    server.registerTool(
        'kanbanzone_create_comment',
        {
            title: 'Create a comment on a card',
            description: [
                'Add a comment to a card.',
                '',
                'Args:',
                '  - card (string, required): card ObjectId.',
                `  - text (string, required): the comment body. ${RICH_TEXT_HELP}`,
                '',
                'Examples:',
                '  - "Add a comment to card 670... saying: blocked on design review"',
            ].join('\n'),
            inputSchema: {
                card: objectIdField,
                text: z.string().min(1).max(10000).describe(RICH_TEXT_HELP),
            },
            annotations: WRITE,
        },
        async ({ card, text }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/comments', { method: 'POST', body: { card, text: toQuillHtml(text) } });
                return {
                    content: [{ type: 'text', text: `Comment added to card ${card}.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_list_card_comments',
        {
            title: 'List comments on a card',
            description: [
                'List all comments on a card, oldest first.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "What have people said on card 670...?"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}/comments`);
                const items = Array.isArray(data) ? data : data.comments || [];

                if (response_format === ResponseFormat.JSON) {
                    return {
                        content: [{ type: 'text', text: toJsonString(items) }],
                        structuredContent: { items },
                    };
                }

                const rerender = list =>
                    [`# Comments on card ${id} (${list.length})`, '', ...list.map(renderComment)].join('\n');
                const { text } = truncateIfNeeded({ items, rendered: rerender(items), rerender });
                return { content: [{ type: 'text', text }], structuredContent: { items } };
            })
    );
};

module.exports = { registerCommentsTools };
