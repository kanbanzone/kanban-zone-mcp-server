const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString } = require('../format');
const { objectIdField, boardPublicIdField } = require('../schemas');

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const renderLabel = label => {
    const defaultTag = label.isDefault ? ' _(default)_' : '';
    const color = label.color ? ` \`${label.color}\`` : '';
    return `- **${label.description}**${color}${defaultTag} — id: \`${label.id}\`, position: ${label.position}`;
};

const registerLabelsTools = server => {
    server.registerTool(
        'kanbanzone_create_label',
        {
            title: 'Create a label on a board',
            description: [
                'Create a label on a board. Each board can have at most one default label —',
                'setting `is_default: true` automatically clears the flag on any existing default',
                'label for the same board.',
                '',
                'Args:',
                '  - board (string, required): board publicId.',
                '  - color (string, required): hex color, e.g. "#FF0000".',
                '  - description (string, required): human-readable label text.',
                '  - is_default (boolean, optional): mark this label as the board default.',
                '  - position (number, optional): sort position. Defaults to end of the list.',
                '',
                'Examples:',
                '  - "Add an Urgent label to board OeMrbG8g with color #FF0000"',
                '  - "Create a default Backlog label on board OeMrbG8g"',
            ].join('\n'),
            inputSchema: {
                board: boardPublicIdField,
                color: z.string().min(1).max(32),
                description: z.string().min(1).max(120),
                is_default: z.boolean().optional(),
                position: z.number().int().min(0).optional(),
            },
            annotations: WRITE,
        },
        async ({ board, color, description, is_default, position }) =>
            safeRun(async () => {
                const body = { board, color, description };
                if (is_default !== undefined) body.isDefault = is_default;
                if (position !== undefined) body.position = position;
                const data = await makeApiRequest('/labels', { method: 'POST', body });
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Created label **${data.description}** (\`${data.id}\`) on board ${board}${
                                data.isDefault ? ' as the new default' : ''
                            }.`,
                        },
                    ],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_get_label',
        {
            title: 'Get a label',
            description: [
                'Fetch one label by its ObjectId.',
                '',
                'Args:',
                '  - id (string, required): label ObjectId.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "Show me label 670aabbccddeeff001122334"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/labels/${id}`);
                const text =
                    response_format === ResponseFormat.JSON ? toJsonString(data) : renderLabel(data);
                return { content: [{ type: 'text', text }], structuredContent: data };
            })
    );

    server.registerTool(
        'kanbanzone_update_label',
        {
            title: 'Update a label',
            description: [
                'Update one or more fields on an existing label. Only included fields are changed.',
                '',
                'Setting `is_default: true` automatically clears the flag on every other label on',
                'the same board. Setting `is_default: false` just unsets it — the board may end up',
                'with no default label.',
                '',
                'Args:',
                '  - id (string, required): label ObjectId.',
                '  - color (string, optional): hex color, e.g. "#FF0000".',
                '  - description (string, optional): human-readable label text.',
                '  - is_default (boolean, optional): mark as board default (clears others).',
                '  - position (number, optional): sort position.',
                '',
                'Examples:',
                '  - "Rename label 670... to High Priority"',
                '  - "Make label 670... the default for its board"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                color: z.string().min(1).max(32).optional(),
                description: z.string().min(1).max(120).optional(),
                is_default: z.boolean().optional(),
                position: z.number().int().min(0).optional(),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, color, description, is_default, position }) =>
            safeRun(async () => {
                const body = {};
                if (color !== undefined) body.color = color;
                if (description !== undefined) body.description = description;
                if (is_default !== undefined) body.isDefault = is_default;
                if (position !== undefined) body.position = position;
                const data = await makeApiRequest(`/labels/${id}`, { method: 'PATCH', body });
                return {
                    content: [{ type: 'text', text: `Updated label **${data.description}**.` }],
                    structuredContent: data,
                };
            })
    );
};

module.exports = { registerLabelsTools };
