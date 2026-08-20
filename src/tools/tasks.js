const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { isoDateField, objectIdField } = require('../schemas');
const { RICH_TEXT_HELP } = require('../format');
const { richTextBody } = require('../markdown-delta');

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const registerTasksTools = server => {
    server.registerTool(
        'kanbanzone_create_task',
        {
            title: 'Create a task in a checklist',
            description: [
                'Add a task to an existing checklist.',
                '',
                'Args:',
                '  - checklist (string, required): checklist ObjectId.',
                `  - description (string, required): the task text. ${RICH_TEXT_HELP}`,
                '  - position (number, optional, ≥0): if omitted, the task is appended.',
                '  - dueAt (string, optional): ISO date.',
                '  - owner (string, optional): account ObjectId or email.',
                '',
                'Examples:',
                '  - "Add a task \'Update README\' to checklist 670..."',
            ].join('\n'),
            inputSchema: {
                checklist: objectIdField,
                description: z.string().min(1).max(2000).describe(RICH_TEXT_HELP),
                position: z.number().int().min(0).optional(),
                dueAt: isoDateField.optional(),
                owner: z.string().optional(),
            },
            annotations: WRITE,
        },
        async ({ checklist, description, position, dueAt, owner }) =>
            safeRun(async () => {
                const body = { checklist, ...richTextBody('description', description) };
                if (position !== undefined) body.position = position;
                if (dueAt !== undefined) body.dueAt = dueAt;
                if (owner !== undefined) body.owner = owner;
                const data = await makeApiRequest('/tasks', { method: 'POST', body });
                return {
                    content: [{ type: 'text', text: `Task created in checklist ${checklist}.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_update_task',
        {
            title: 'Update a task',
            description: [
                'Update fields on an existing task. Only included fields are changed.',
                '',
                'Args:',
                '  - id (string, required): task ObjectId.',
                `  - description (string, optional): ${RICH_TEXT_HELP}`,
                '  - completed (boolean, optional)',
                '  - completedOn (string, optional): ISO date — only honoured when completed=true.',
                '  - dueAt (string, optional): ISO date.',
                '  - owner (string, optional): account ObjectId or email.',
                '  - position (number, optional, ≥0)',
                '',
                'Examples:',
                '  - "Mark task 670... as complete"',
                '  - "Reassign task 670... to alice@example.com"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                description: z.string().min(1).max(2000).optional().describe(RICH_TEXT_HELP),
                completed: z.boolean().optional(),
                completedOn: isoDateField.optional(),
                dueAt: isoDateField.optional(),
                owner: z.string().optional(),
                position: z.number().int().min(0).optional(),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, ...updates }) =>
            safeRun(async () => {
                if (updates.description !== undefined) {
                    const body = richTextBody('description', updates.description);
                    delete updates.description;
                    Object.assign(updates, body);
                }
                const data = await makeApiRequest(`/tasks/${id}`, { method: 'PATCH', body: updates });
                return {
                    content: [{ type: 'text', text: `Updated task ${id}.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_move_task',
        {
            title: 'Move a task to another checklist',
            description: [
                'Move a task between checklists (or reorder within the same checklist).',
                '',
                'Args:',
                '  - id (string, required): task ObjectId.',
                '  - checklistFrom (string, required): source checklist ObjectId.',
                '  - checklistTo (string, required): destination checklist ObjectId. Pass the same value as checklistFrom to reorder in place.',
                '  - position (number, required, ≥0): destination position.',
                '',
                'Examples:',
                '  - "Move task 670... from checklist A to checklist B at position 0"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                checklistFrom: objectIdField,
                checklistTo: objectIdField,
                position: z.number().int().min(0),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, checklistFrom, checklistTo, position }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/tasks/${id}/move`, {
                    method: 'POST',
                    body: { checklistFrom, checklistTo, position },
                });
                // The move endpoint returns a plain string; MCP structuredContent must be an object.
                return {
                    content: [{ type: 'text', text: `Moved task ${id}.` }],
                    structuredContent: { ok: true },
                };
            })
    );
};

module.exports = { registerTasksTools };
