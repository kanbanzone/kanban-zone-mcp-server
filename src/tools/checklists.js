const { z } = require('zod');
const { makeApiRequest, safeRun } = require('../client');
const { responseFormatField, ResponseFormat, toJsonString, truncateIfNeeded, RICH_TEXT_HELP } = require('../format');
const { markdownToHtml } = require('../markdown');
const { objectIdField } = require('../schemas');

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const registerChecklistsTools = server => {
    server.registerTool(
        'kanbanzone_create_checklist',
        {
            title: 'Create a checklist on a card',
            description: [
                'Create a checklist on a card. Optionally pre-populate it with tasks in one call.',
                '',
                'Args:',
                '  - card (string, required): card ObjectId.',
                '  - title (string, optional): checklist title.',
                '  - checklistTemplate (string, optional): checklist template ObjectId.',
                `  - tasks (array, optional): list of { description: string }. ${RICH_TEXT_HELP} Task position is taken from array index — any \`position\` field on a task is ignored.`,
                '',
                'Examples:',
                '  - "Add a checklist to card 670... with tasks: write tests, update docs"',
                '  - "Apply checklist template 660... to card 670..."',
            ].join('\n'),
            inputSchema: {
                card: objectIdField,
                title: z.string().max(200).optional(),
                checklistTemplate: objectIdField.optional(),
                tasks: z
                    .array(
                        z.object({
                            description: z
                                .string()
                                .min(1)
                                .max(2000)
                                .describe(RICH_TEXT_HELP),
                        })
                    )
                    .optional(),
            },
            annotations: WRITE,
        },
        async ({ card, title, checklistTemplate, tasks }) =>
            safeRun(async () => {
                const body = { card };
                if (title !== undefined) body.title = title;
                if (checklistTemplate !== undefined) body.checklistTemplate = checklistTemplate;
                // tasks[].description is a plain string field on the API, so convert markdown
                // here the same way every other rich-text field is converted.
                if (tasks !== undefined) {
                    body.tasks = tasks.map(task => ({ ...task, description: markdownToHtml(task.description) }));
                }

                const data = await makeApiRequest('/checklists', { method: 'POST', body });
                const taskCount = Array.isArray(data.tasks) ? data.tasks.length : 0;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Created checklist **${data.title || '(untitled)'}** with ${taskCount} task(s).`,
                        },
                    ],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_update_checklist',
        {
            title: 'Update a checklist',
            description: [
                'Update title or position of a checklist on a card.',
                '',
                'Args:',
                '  - id (string, required): checklist ObjectId.',
                '  - title (string, optional)',
                '  - position (number, optional, ≥0)',
                '',
                'Examples:',
                '  - "Rename checklist 670... to \'QA tasks\'"',
                '  - "Move checklist 670... to position 0"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                title: z.string().max(200).optional(),
                position: z.number().int().min(0).optional(),
            },
            annotations: IDEMPOTENT_WRITE,
        },
        async ({ id, title, position }) =>
            safeRun(async () => {
                const updates = {};
                if (title !== undefined) updates.title = title;
                if (position !== undefined) updates.position = position;
                const data = await makeApiRequest(`/checklists/${id}`, { method: 'PATCH', body: updates });
                return {
                    content: [{ type: 'text', text: `Updated checklist ${id}.` }],
                    structuredContent: data,
                };
            })
    );

    server.registerTool(
        'kanbanzone_list_card_checklists',
        {
            title: 'List checklists on a card',
            description: [
                'List all checklists on a card, including their tasks.',
                '',
                'Args:',
                '  - id (string, required): card ObjectId.',
                '  - response_format ("markdown" | "json").',
                '',
                'Examples:',
                '  - "What checklists are on card 670... and what\'s left to do?"',
            ].join('\n'),
            inputSchema: {
                id: objectIdField,
                response_format: responseFormatField,
            },
            annotations: READ,
        },
        async ({ id, response_format }) =>
            safeRun(async () => {
                const data = await makeApiRequest(`/cards/${id}/checklists`);
                const items = Array.isArray(data) ? data : data.checklists || [];

                if (response_format === ResponseFormat.JSON) {
                    return {
                        content: [{ type: 'text', text: toJsonString(items) }],
                        structuredContent: { items },
                    };
                }

                const renderChecklist = checklist => {
                    const tasks = Array.isArray(checklist.tasks) ? checklist.tasks : [];
                    const lines = [`## ${checklist.title || '(untitled)'} (\`${checklist._id}\`)`];
                    for (const task of tasks) {
                        const box = task.completed ? '[x]' : '[ ]';
                        lines.push(`- ${box} ${task.description} (\`${task._id}\`)`);
                    }
                    return lines.join('\n');
                };

                const rerender = list =>
                    [`# Checklists on card ${id} (${list.length})`, '', ...list.map(renderChecklist)].join('\n\n');
                const { text } = truncateIfNeeded({ items, rendered: rerender(items), rerender });

                return { content: [{ type: 'text', text }], structuredContent: { items } };
            })
    );
};

module.exports = { registerChecklistsTools };
