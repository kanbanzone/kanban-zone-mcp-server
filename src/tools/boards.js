const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString, truncateIfNeeded } = require('../format');
const { boardPublicIdField, pageField, countField } = require('../schemas');

const READ_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};

// The API wraps each board as { BoardItem: { name, publicId, ... } }.
const unwrapBoard = entry => entry.BoardItem || entry;

const renderBoardLine = entry => {
    const board = unwrapBoard(entry);
    return `- **${board.name || board.title}** (${board.publicId})`;
};

const registerBoardsTools = server => {
    server.registerTool(
        'kanbanzone_list_boards',
        {
            title: 'List boards',
            description: [
                'List all boards in the organization with optional related data.',
                '',
                'Args (all optional):',
                '  - include_archived (boolean): include archived boards.',
                '  - include_columns (boolean): include columns for each board.',
                '  - include_labels (boolean): include labels for each board.',
                '  - include_members (boolean): include member lists for each board.',
                '  - include_custom_fields (boolean): include custom fields per board.',
                '  - page (number, optional, default 1).',
                '  - count (number, optional, default 20, max 100).',
                '  - response_format ("markdown" | "json"): output format. Defaults to markdown.',
                '',
                'Examples:',
                '  - "What boards do I have?"',
                '  - "Show me my boards including their columns"',
            ].join('\n'),
            inputSchema: {
                include_archived: z.boolean().optional(),
                include_columns: z.boolean().optional(),
                include_labels: z.boolean().optional(),
                include_members: z.boolean().optional(),
                include_custom_fields: z.boolean().optional(),
                page: pageField,
                count: countField,
                response_format: responseFormatField,
            },
            annotations: READ_ANNOTATIONS,
        },
        async ({
            include_archived,
            include_columns,
            include_labels,
            include_members,
            include_custom_fields,
            page,
            count,
            response_format,
        }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/boards', {
                    query: {
                        includeArchived: include_archived ? 'true' : undefined,
                        includeColumns: include_columns ? 'true' : undefined,
                        includeLabels: include_labels ? 'true' : undefined,
                        includeMembers: include_members ? 'true' : undefined,
                        includeCustomFields: include_custom_fields ? 'true' : undefined,
                    },
                });

                const all = Array.isArray(data) ? data : data.boards || [];
                // /boards has no server-side pagination, so window the list here — an org with
                // hundreds of boards would otherwise fill the caller's context in one response.
                const total = all.length;
                const boards = all.slice((page - 1) * count, page * count);
                const hasMore = total > page * count;

                if (response_format === ResponseFormat.JSON) {
                    const payload = { total, count: boards.length, page, boards, has_more: hasMore };
                    return {
                        content: [{ type: 'text', text: toJsonString(payload) }],
                        structuredContent: payload,
                    };
                }

                const heading = `# Boards (${boards.length} of ${total}, page ${page})`;
                const rerender = items => [heading, '', ...items.map(renderBoardLine)].join('\n');
                const { text } = truncateIfNeeded({
                    items: boards,
                    rendered: rerender(boards),
                    rerender,
                });

                return {
                    content: [{ type: 'text', text }],
                    structuredContent: { total, count: boards.length, page, boards, has_more: hasMore },
                };
            })
    );

    server.registerTool(
        'kanbanzone_get_board',
        {
            title: 'Get a board',
            description: [
                'Fetch a single board by its publicId.',
                '',
                'Args:',
                '  - board (string, required): the board publicId, e.g. "OeMrbG8g".',
                '  - include_columns (boolean): include columns.',
                '  - include_labels (boolean): include labels.',
                '  - include_members (boolean): include members.',
                '  - include_custom_fields (boolean): include custom fields.',
                '  - response_format ("markdown" | "json"): output format. Defaults to markdown.',
                '',
                'Examples:',
                '  - "Show me the OeMrbG8g board with its columns"',
            ].join('\n'),
            inputSchema: {
                board: boardPublicIdField.describe('Board publicId, e.g. "OeMrbG8g".'),
                include_columns: z.boolean().optional(),
                include_labels: z.boolean().optional(),
                include_members: z.boolean().optional(),
                include_custom_fields: z.boolean().optional(),
                response_format: responseFormatField,
            },
            annotations: READ_ANNOTATIONS,
        },
        async ({ board, include_columns, include_labels, include_members, include_custom_fields, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/boards/${encodeURIComponent(board)}`, {
                    query: {
                        includeColumns: include_columns ? 'true' : undefined,
                        includeLabels: include_labels ? 'true' : undefined,
                        includeMembers: include_members ? 'true' : undefined,
                        includeCustomFields: include_custom_fields ? 'true' : undefined,
                    },
                });

                const item = unwrapBoard(data.boards?.[0] || data);
                const text =
                    response_format === ResponseFormat.JSON
                        ? toJsonString(data)
                        : `# ${item.name || item.title}\n- **publicId**: ${item.publicId}${item.description ? `\n- **description**: ${item.description}` : ''}`;

                return {
                    content: [{ type: 'text', text }],
                    structuredContent: data,
                };
            })
    );

    // Columns / labels / members / custom-fields all render the same way — a tiny spec table
    // generates four near-identical tools.
    const subResources = [
        {
            name: 'kanbanzone_list_board_columns',
            title: 'List board columns',
            path: 'columns',
            label: 'Columns',
            extraSchema: {
                query: z
                    .string()
                    .optional()
                    .describe('Optional substring to filter column titles.'),
                include_default: z
                    .boolean()
                    .optional()
                    .describe('Include the default "Backlog" / "Done" / archive columns.'),
            },
            buildQuery: ({ query, include_default }) => ({
                query,
                includeDefault: include_default ? 'true' : undefined,
            }),
            renderItem: column => `- **${column.title}** (\`${column._id}\`)${column.bucketState ? ` — ${column.bucketState}` : ''}`,
            example: '"List columns on the OeMrbG8g board"',
        },
        {
            name: 'kanbanzone_list_board_labels',
            title: 'List board labels',
            path: 'labels',
            label: 'Labels',
            extraSchema: {},
            buildQuery: () => ({}),
            renderItem: label => `- **${label.description || '(no description)'}** (\`${label._id}\`)${label.color ? ` color ${label.color}` : ''}`,
            example: '"What labels are available on this board?"',
        },
        {
            name: 'kanbanzone_list_board_members',
            title: 'List board members',
            path: 'members',
            label: 'Members',
            extraSchema: {},
            buildQuery: () => ({}),
            renderItem: member => {
                const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
                return `- **${name}** (${member.email}) — \`${member._id}\``;
            },
            example: '"Who can I assign cards to on this board?"',
        },
        {
            name: 'kanbanzone_list_board_custom_fields',
            title: 'List board custom fields',
            path: 'custom-fields',
            label: 'Custom fields',
            extraSchema: {},
            buildQuery: () => ({}),
            renderItem: field => `- **${field.label || field.name}** (\`${field._id}\`) — type ${field.type}`,
            example: '"What custom fields does this board have?"',
        },
    ];

    for (const sub of subResources) {
        server.registerTool(
            sub.name,
            {
                title: sub.title,
                description: [
                    `${sub.title} for a board.`,
                    '',
                    'Args:',
                    '  - board (string, required): the board publicId, e.g. "OeMrbG8g".',
                    ...Object.keys(sub.extraSchema).map(key => `  - ${key}: see schema.`),
                    '  - response_format ("markdown" | "json"): output format. Defaults to markdown.',
                    '',
                    `Example: ${sub.example}`,
                ].join('\n'),
                inputSchema: {
                    board: boardPublicIdField.describe('Board publicId, e.g. "OeMrbG8g".'),
                    ...sub.extraSchema,
                    response_format: responseFormatField,
                },
                annotations: READ_ANNOTATIONS,
            },
            async args =>
                safeRun(async () => {
                    const { board, response_format } = args;
                    const data = await makeApiRequest(`/boards/${encodeURIComponent(board)}/${sub.path}`, {
                        query: sub.buildQuery(args),
                    });
                    const items = Array.isArray(data) ? data : [];

                    if (response_format === ResponseFormat.JSON) {
                        return {
                            content: [{ type: 'text', text: toJsonString(items) }],
                            structuredContent: { items },
                        };
                    }

                    const rerender = list =>
                        [`# ${sub.label} (${list.length})`, '', ...list.map(sub.renderItem)].join('\n');
                    const { text } = truncateIfNeeded({
                        items,
                        rendered: rerender(items),
                        rerender,
                    });

                    return {
                        content: [{ type: 'text', text }],
                        structuredContent: { items },
                    };
                })
        );
    }
};

module.exports = { registerBoardsTools };
