const DEFAULT_BASE_URL = 'https://integrations.kanbanzone.io/v1';

// List tools that exceed this halve their results and return a `truncated` note,
// telling the agent to paginate or filter.
const CHARACTER_LIMIT = 25000;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SERVER_NAME = 'kanban-zone-mcp-server';
const SERVER_VERSION = '0.1.4';

const REQUEST_TIMEOUT_MS = 30000;

module.exports = {
    DEFAULT_BASE_URL,
    CHARACTER_LIMIT,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    SERVER_NAME,
    SERVER_VERSION,
    REQUEST_TIMEOUT_MS,
};
