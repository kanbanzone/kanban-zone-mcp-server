const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString, truncateIfNeeded, RICH_TEXT_HELP } = require('../format');
const { objectIdField, boardPublicIdField, pageField, countField, isoDateField } = require('../schemas');

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// list_cards nests card fields under CardItem; search_cards returns them flat. Handle both.
const renderCardLine = card => {
    const c = (card && card.CardItem) || card || {};
    const id = (card && card._id) || c._id;
    const number = c.number !== undefined ? `#${c.number} ` : '';
    const ownerEmail = c.owner && typeof c.owner === 'object' ? c.owner.email : c.owner;
    const owner = ownerEmail ? ` — owner ${ownerEmail}` : '';
    return `- ${number}**${c.title}** (\`${id}\`)${owner}`;
};

// The /cards list envelope is { count, totalAvailable, cards, hasMore }; tolerate a bare
// array or search-style { total, has_more } names too, so pagination metadata stays accurate.
const summarizeListResponse = (data, page, count) => {
    const items = Array.isArray(data) ? data : (data && (data.cards || data.results || data.items)) || [];
    const envelope = data && !Array.isArray(data) ? data : {};
    const total = [envelope.totalAvailable, envelope.total].find(v => typeof v === 'number') ?? items.length;
    const hasMore =
        typeof envelope.hasMore === 'boolean'
            ? envelope.hasMore
            : typeof envelope.has_more === 'boolean'
            ? envelope.has_more
            : total > page * count;
    return { items, total, hasMore };
};

const registerCardsTools = server => {
    server.registerTool(
        'kanbanzone_create_card',
        {
            title: 'Create a card',
            description: [
                'Create a single card on a board.',
                'Internally calls the batch POST /cards endpoint with a one-card array.',
                '',
                'Args:',
                '  - board (string, required): board publicId.',
                '  - title (string, required): card title.',
                `  - description (string, optional): ${RICH_TEXT_HELP}`,
                '  - column (string, optional): column ObjectId. If omitted, the card lands in the default backlog.',
                '  - owner (string, optional): account email of the assignee.',
                '  - label (string, optional): label name (e.g. "Enhancement"). Must match a label configured on the board.',
                '  - addToTop (boolean, optional): insert at the top of the column instead of the bottom.',
                '',
                'Examples:',
                '  - "Create a card titled \'Refactor auth\' on board OeMrbG8g"',
                '  - "Add a card to the To-Do column with description ..."',
            ].join('\n'),
            inputSchema: {
                board: boardPublicIdField,
                title: z.string().min(1).max(500),
                description: z.string().optional().describe(RICH_TEXT_HELP),
                column: objectIdField.optional(),
                owner: z.string().optional(),
                label: z.string().optional(),
                addToTop: z.boolean().optional(),
            },
            annotations: WRITE,
        },
        async ({ board, title, description, column, owner, label, addToTop }) =>
            safeRun(async () => {
                const card = { title };
                if (description !== undefined) card.description = description;
                if (column !== undefined) card.columnId = column;
                if (owner !== undefined) card.owner = owner;
                if (label !== undefined) card.label = label;

                const body = { board, cards: [card] };
                if (addToTop !== undefined) body.addToTop = addToTop;

                const data = await makeApiRequest('/cards', { method: 'POST', body });
                const created = Array.isArray(data) ? data[0] : data;

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Created card **${created.title}** (\`${created._id}\`) on board ${board}.`,
                        },
                    ],
                    structuredContent: created,
                };
            })
    );

    server.registerTool(
        'kanbanzone_list_cards',
        {
            title: 'List cards on a board',
            description: [
                'List cards on a board with optional filters and pagination.',
                '',
                'Args:',
                '  - board (string, required): board publicId.',
                '  - columns (string, optional): comma-separated column ObjectIds to restrict to.',
                '  - owner (string, optional): account ObjectId or email — only cards owned by this person.',
                '  - label (string, optional): label ObjectId or description string.',
                '  - days_since_last_update (number, optional): only cards untouched for N+ days.',
                '  - include_archived (boolean, optional): include archived cards.',
                '  - number (number, optional): fetch a single card by its #N number.',
                '  - page (number, optional, default 1).',
                '  - count (number, optional, default 20, max 100).',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "What cards are in progress on the OeMrbG8g board?"',
                '  - "List my cards owned by alice@example.com"',
            ].join('\n'),
            inputSchema: {
                board: boardPublicIdField,
                columns: z.string().optional(),
                owner: z.string().optional(),
                label: z.string().optional(),
                days_since_last_update: z.number().int().min(0).optional(),
                include_archived: z.boolean().optional(),
                number: z.number().int().min(1).optional(),
                page: pageField,
                count: countField,
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({
            board,
            columns,
            owner,
            label,
            days_since_last_update,
            include_archived,
            number,
            page,
            count,
            response_format,
        }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/cards', {
                    query: {
                        board,
                        columns,
                        owner,
                        label,
                        daysSinceLastUpdate: days_since_last_update,
                        includeArchived: include_archived ? 'true' : undefined,
                        number,
                        page,
                        count,
                    },
                });

                const { items, total, hasMore } = summarizeListResponse(data, page, count);

                if (response_format === ResponseFormat.JSON) {
                    return {
                        content: [{ type: 'text', text: toJsonString({ total, count: items.length, page, items, has_more: hasMore }) }],
                        structuredContent: { total, count: items.length, page, items, has_more: hasMore },
                    };
                }

                const rerender = list =>
                    [
                        `# Cards on ${board} (page ${page}, ${list.length} of ${total})`,
                        '',
                        ...list.map(renderCardLine),
                        hasMore ? `\n_More results available — call again with \`page: ${page + 1}\`._` : '',
                    ]
                        .filter(Boolean)
                        .join('\n');

                const { text } = truncateIfNeeded({ items, rendered: rerender(items), rerender });

                return {
                    content: [{ type: 'text', text }],
                    structuredContent: { total, count: items.length, page, items, has_more: hasMore },
                };
            })
    );

    server.registerTool(
        'kanbanzone_get_card',
        {
            title: 'Get a card',
            description: [
                'Fetch one card by its ObjectId.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - board (string, optional): board publicId — required for mirror cards to disambiguate.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "Show me card 6700aabbccddeeff00112233"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                board: boardPublicIdField.optional(),
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, board, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}`, { query: { board } });
                const text =
                    response_format === ResponseFormat.JSON
                        ? toJsonString(data)
                        : `# ${data.title}\n- **id**: ${data._id}${data.description ? `\n- **description**: ${data.description}` : ''}`;
                return { content: [{ type: 'text', text }], structuredContent: data };
            })
    );

    server.registerTool(
        'kanbanzone_update_card',
        {
            title: 'Update a card',
            description: [
                'Update fields on an existing card. Only included fields are changed.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - board (string, optional): board publicId — required for mirror cards to disambiguate.',
                '  - title (string, optional)',
                `  - description (string, optional): ${RICH_TEXT_HELP}`,
                '  - owner (string, optional): account email or ObjectId.',
                '  - label (string, optional): label name (e.g. "Enhancement") or ObjectId.',
                '  - dueAt (string, optional): ISO date or datetime.',
                '  - customFields (array, optional): list of { label, value } pairs. `label` matches the custom-field name configured on the board.',
                '',
                'Examples:',
                '  - "Reassign card 670... to bob@example.com"',
                '  - "Set the due date on card 670... to 2025-06-01"',
                '  - "Set the Project Code custom field on card 670... to ABC-123"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                board: boardPublicIdField.optional(),
                title: z.string().min(1).max(500).optional(),
                description: z.string().optional().describe(RICH_TEXT_HELP),
                owner: z.string().optional(),
                label: z.string().optional(),
                dueAt: isoDateField.optional(),
                customFields: z
                    .array(
                        z.object({
                            label: z.string().min(1),
                            value: z.union([z.string(), z.number(), z.boolean()]),
                        })
                    )
                    .optional(),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, ...updates }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}`, { method: 'PATCH', body: updates });
                return {
                    content: [{ type: 'text', text: `Updated card **${data.title || id}**.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_move_card',
        {
            title: 'Move a card',
            description: [
                'Move a card to a different column (and optionally a different board).',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - board (string, required): destination board publicId.',
                '  - column (string, required): destination column ObjectId.',
                '  - position (number, optional): 0-based position within the destination column.',
                '',
                'Examples:',
                '  - "Move card 670... to the In Progress column"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                board: boardPublicIdField,
                column: objectIdField,
                position: z.number().int().min(0).optional(),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, board, column, position }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}/move`, {
                    method: 'POST',
                    body: { board, columnId: column, position },
                });
                return {
                    content: [{ type: 'text', text: `Moved card to column ${column}.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_get_card_history',
        {
            title: 'Get card history',
            description: [
                'Fetch the activity history for a card (column moves, edits, comments, etc.) starting from a date.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - start (string, required): ISO date — only events on/after this date are returned.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "What happened to card 670... since 2025-01-01?"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                start: isoDateField.describe('ISO date — only events on/after this date are returned.'),
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, start, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}/history`, { query: { start } });
                const events = Array.isArray(data) ? data : data.history || data.events || [];

                if (response_format === ResponseFormat.JSON) {
                    return {
                        content: [{ type: 'text', text: toJsonString(events) }],
                        structuredContent: { events },
                    };
                }

                const rerender = list =>
                    [
                        `# History (${list.length} events since ${start})`,
                        '',
                        ...list.map(ev => `- ${ev.createdAt || ev.date || '?'} — ${ev.action || ev.type}`),
                    ].join('\n');
                const { text } = truncateIfNeeded({ items: events, rendered: rerender(events), rerender });
                return { content: [{ type: 'text', text }], structuredContent: { events } };
            })
    );

    server.registerTool(
        'kanbanzone_get_card_metrics',
        {
            title: 'Get card metrics',
            description: [
                'Fetch time-in-column and cycle/lead-time metrics for a card.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - board (string, optional): board publicId — required for mirror cards.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "How long has card 670... been in each column?"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                board: boardPublicIdField.optional(),
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, board, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}/metrics`, { query: { board } });
                const text =
                    response_format === ResponseFormat.JSON
                        ? toJsonString(data)
                        : `# Metrics for card ${id}\n${toJsonString(data)}`;
                // The metrics endpoint returns an array; MCP structuredContent must be an object.
                return { content: [{ type: 'text', text }], structuredContent: { metrics: data } };
            })
    );

    server.registerTool(
        'kanbanzone_search_cards',
        {
            title: 'Search cards by title or number',
            description: [
                'Full-text search across cards in your organization. Matches card titles and card numbers.',
                'Task, comment, and attachment text are not searched in this version.',
                'Results are sorted by relevance (best match first).',
                '',
                'Mirror cards: results are returned per (card, board) pair — a card mirrored to two',
                'boards that matches the query appears twice, each with that board\'s bucket, label,',
                'owner, and watchers. Use the returned `board` field to know which board to act on.',
                '',
                'Args:',
                '  - q (string, required): search text, minimum 2 characters.',
                '  - board (string, optional): board publicId to narrow the search to one board. Omit to search across every board in the org.',
                '  - include_archived (boolean, optional): include archived cards.',
                '  - page (number, optional, default 1).',
                '  - count (number, optional, default 20, max 100).',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "Search for cards mentioning billing"',
                '  - "Find cards about webhook on the OeMrbG8g board"',
            ].join('\n'),
            inputSchema: {
                q: z.string().min(2).describe('Search text (min 2 characters).'),
                board: boardPublicIdField.optional(),
                include_archived: z.boolean().optional(),
                page: pageField,
                count: countField,
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ q, board, include_archived, page, count, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/cards/search', {
                    query: {
                        q,
                        board,
                        includeArchived: include_archived ? 'true' : undefined,
                        page,
                        count,
                    },
                });

                const items = data.items || [];
                const total = typeof data.total === 'number' ? data.total : items.length;
                const hasMore = data.has_more === true;

                if (response_format === ResponseFormat.JSON) {
                    return {
                        content: [{ type: 'text', text: toJsonString(data) }],
                        structuredContent: data,
                    };
                }

                const rerender = list =>
                    [
                        `# Search results for "${q}" (page ${page}, ${list.length} of ${total})`,
                        '',
                        ...list.map(renderCardLine),
                        hasMore ? `\n_More results available — call again with \`page: ${page + 1}\`._` : '',
                    ]
                        .filter(Boolean)
                        .join('\n');

                const { text } = truncateIfNeeded({ items, rendered: rerender(items), rerender });

                return {
                    content: [{ type: 'text', text }],
                    structuredContent: data,
                };
            })
    );
};

module.exports = { registerCardsTools, renderCardLine, summarizeListResponse };
