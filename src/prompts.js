// User-invocable MCP prompts — the methodology layer over the tools. In Claude Code they
// surface as slash commands, in Claude Desktop as picker items; clients without the prompts
// primitive get the same texts as copy-paste blocks (see PROMPTS.md). Keep each prompt a
// thin orchestration of the tools: the client model brings the intelligence, the tools bring
// the data, these bring the Kanban Zone opinion.

const { z } = require('zod');

const boardArg = z.string().describe('Board publicId, e.g. "OeMrbG8g".');

const userMessage = text => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });

const boardReviewText = (board, agingDays) =>
    [
        `Review Kanban Zone board ${board} for WIP violations and aging cards. Flag what needs attention now.`,
        '',
        'Steps:',
        `1. Call kanbanzone_get_board with board "${board}" (response_format: "json") to confirm the board exists.`,
        '2. Call kanbanzone_list_board_columns for the board (response_format: "json"). Each column is wrapped as',
        '   { ColumnItem: ... }; the WIP limit is ColumnItem.maxWIP and the lower bound is ColumnItem.minWIP.',
        '   Collect the columnId of every column whose maxWIP is set (not null or 0) - only those need cards.',
        '3. Call kanbanzone_list_cards for the board with columns set to those columnIds (comma-separated),',
        '   count: 100, response_format: "json". Fetch further pages until a page comes back short or empty;',
        '   do not rely on has_more alone. Group cards by columnId, never by column title - boards can have',
        '   identically named columns under different parents.',
        "4. Compare each limited column's card count against its maxWIP and note violations.",
        `5. A card is aging when it has sat in its current column for more than ${agingDays} days. Check the`,
        '   oldest few candidates per work column (by lastActionAt) with kanbanzone_get_card_metrics. In the',
        '   metrics, the current column is the segment with endAt null - its totalTime reads 0, so compute the',
        '   days from its startAt.',
        '',
        'Output format:',
        '- WIP violations: column name - limit N, actual M.',
        '- Aging cards: card title - column, days in column.',
        '- Recommended action: one line per issue. Direct, no hedging.',
        '- If there are no violations and no aging cards, say so in one line.',
    ].join('\n');

const checklistGeneratorText = card =>
    [
        `Turn the description of Kanban Zone card ${card} into a UX Checklist and an AC Checklist, matching`,
        "Kanban Zone's standard card structure.",
        '',
        'Steps:',
        `1. Call kanbanzone_get_card with id "${card}" and read the description.`,
        '2. Draft a "UX Checklist": concrete, testable UI/UX items only.',
        '3. Draft an "AC Checklist": acceptance criteria only, each written as GIVEN/WHEN/THEN.',
        '4. Present both drafts and wait for confirmation. Do not write to the card before confirmation.',
        '5. On confirmation, create each checklist with a single kanbanzone_create_checklist call, passing all of',
        '   its items in the tasks array (task order follows the array).',
        '',
        'Rules:',
        '- Every line must be testable. No vague items.',
        '- Base items only on what the description supports; ask about gaps instead of inventing.',
    ].join('\n');

const standupSummaryText = (board, hours) =>
    [
        `Draft a standup update (yesterday / today / blockers) from recent movement on Kanban Zone board ${board}.`,
        '',
        'Steps:',
        `1. Call kanbanzone_list_cards for the board with count: 100 (response_format: "json"). Fetch further`,
        '   pages until a page comes back short or empty (do not rely on has_more alone), and stop after five',
        '   pages - on a larger board, ask for a narrower scope instead.',
        `2. Preselect from the list itself: cards whose doneAt falls in the last ${hours} hours (yesterday), cards`,
        '   in work columns with recent lastActionAt (today), and cards with blocked: true (blockers - the',
        '   blockedReason is already on the card, no extra calls needed).',
        `3. Only when a card's story is unclear, call kanbanzone_get_card_history with start set to ${hours} hours`,
        '   ago as an ISO date.',
        '',
        'Output format:',
        '- Yesterday: short bullets, card titles only, no id numbers.',
        '- Today: short bullets.',
        '- Blockers: card title plus one line on what is blocking it.',
        '- Keep the whole update short enough to read aloud in a minute.',
    ].join('\n');

const registerAllPrompts = server => {
    server.registerPrompt(
        'board_review',
        {
            title: 'Board Review',
            description: 'Review a board for WIP violations and aging cards, with recommended actions.',
            argsSchema: {
                board: boardArg,
                aging_days: z.string().optional().describe('Days in a column before a card counts as aging (default 7).'),
            },
        },
        ({ board, aging_days }) => userMessage(boardReviewText(board, aging_days || '7'))
    );

    server.registerPrompt(
        'checklist_generator',
        {
            title: 'Checklist Generator',
            description: "Turn a card's description into UX and GIVEN/WHEN/THEN AC checklists, confirmed before writing.",
            argsSchema: {
                card: z.string().describe('Card ObjectId (24 hex characters).'),
            },
        },
        ({ card }) => userMessage(checklistGeneratorText(card))
    );

    server.registerPrompt(
        'standup_summary',
        {
            title: 'Standup Summary',
            description: 'Draft a yesterday / today / blockers update from recent card movement on a board.',
            argsSchema: {
                board: boardArg,
                hours: z.string().optional().describe('Lookback window in hours (default 48).'),
            },
        },
        ({ board, hours }) => userMessage(standupSummaryText(board, hours || '48'))
    );
};

module.exports = { registerAllPrompts };
