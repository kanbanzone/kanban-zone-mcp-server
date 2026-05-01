const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString } = require('../format');

const READ_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};

const registerOrganizationTools = server => {
    server.registerTool(
        'kanbanzone_get_me',
        {
            title: 'Get current organization (auth check)',
            description: [
                'Verify the configured API key works and return the organization name.',
                'Use this first when troubleshooting setup — if it returns the org name, auth is working.',
                '',
                'Returns:',
                '  { success: true, name: <organization name> }',
                '',
                'Examples:',
                '  - "Is my Kanban Zone connection working?"',
                '  - "Which organization am I connected to?"',
            ].join('\n'),
            inputSchema: { response_format: responseFormatField },
            annotations: READ_ANNOTATIONS,
        },
        async ({ response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/me');
                const text =
                    response_format === ResponseFormat.JSON
                        ? toJsonString(data)
                        : `Connected to **${data.name}**.`;
                return {
                    content: [{ type: 'text', text }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_get_organization',
        {
            title: 'Get organization context',
            description: [
                'Fetch the organization profile, with optional related data: members, boards, columns, labels, and custom fields.',
                'Useful for orienting an agent at session start ("what does this workspace look like?").',
                '',
                'Args (all optional):',
                '  - include_members (boolean): include licensed and unlicensed member lists.',
                '  - include_boards (boolean): include board summaries.',
                '  - include_columns (boolean): include columns under each board (implies include_boards).',
                '  - include_labels (boolean): include labels under each board (implies include_boards).',
                '  - include_custom_fields (boolean): include workspace-level custom fields.',
                '  - response_format ("markdown" | "json"): output format. Defaults to markdown.',
                '',
                'Examples:',
                '  - "List every board with its columns"',
                '  - "Who are the members of this Kanban Zone workspace?"',
            ].join('\n'),
            inputSchema: {
                include_members: z.boolean().optional(),
                include_boards: z.boolean().optional(),
                include_columns: z.boolean().optional(),
                include_labels: z.boolean().optional(),
                include_custom_fields: z.boolean().optional(),
                response_format: responseFormatField,
            },
            annotations: READ_ANNOTATIONS,
        },
        async ({
            include_members,
            include_boards,
            include_columns,
            include_labels,
            include_custom_fields,
            response_format,
        }) =>
            safeRun(async () => {
                const data = await makeApiRequest('/organization', {
                    query: {
                        includeMembers: include_members ? 'true' : undefined,
                        includeBoards: include_boards ? 'true' : undefined,
                        includeColumns: include_columns ? 'true' : undefined,
                        includeLabels: include_labels ? 'true' : undefined,
                        includeCustomFields: include_custom_fields ? 'true' : undefined,
                    },
                });

                let text;
                if (response_format === ResponseFormat.JSON) {
                    text = toJsonString(data);
                } else {
                    const lines = [`# ${data.name || 'Organization'}`];
                    if (Array.isArray(data.boards)) {
                        lines.push('', `## Boards (${data.boards.length})`);
                        for (const board of data.boards) {
                            lines.push(`- **${board.title}** (${board.publicId})`);
                        }
                    }
                    if (data.licensedMembers || data.unlicensedMembers) {
                        const total =
                            (data.licensedMembers || []).length + (data.unlicensedMembers || []).length;
                        lines.push('', `## Members (${total})`);
                    }
                    text = lines.join('\n');
                }

                return {
                    content: [{ type: 'text', text }],
                    structuredContent: data,
                };
            })
    );
};

module.exports = { registerOrganizationTools };
