const axios = require('axios');
const { DEFAULT_BASE_URL, REQUEST_TIMEOUT_MS } = require('./constants');

// Throws on missing/malformed key so index.js can exit before opening the stdio transport.
const parseApiKey = raw => {
    if (!raw || !raw.trim()) {
        throw new Error(
            'KANBANZONE_API_KEY is required. Generate one in Kanban Zone → Org Settings → Integrations → API Key.'
        );
    }
    const idx = raw.indexOf(':');
    if (idx <= 0 || idx === raw.length - 1) {
        throw new Error(
            'KANBANZONE_API_KEY is malformed — expected "accessId:apiKey". Re-copy it from Org Settings → Integrations → API Key.'
        );
    }
    return { accessId: raw.slice(0, idx), secret: raw.slice(idx + 1) };
};

let clientConfig = null;

const initApiClient = () => {
    const { accessId, secret } = parseApiKey(process.env.KANBANZONE_API_KEY);
    clientConfig = {
        accessId,
        secret,
        baseUrl: (process.env.KANBANZONE_BASE_URL && process.env.KANBANZONE_BASE_URL.trim()) || DEFAULT_BASE_URL,
    };
};

const requireConfig = () => {
    if (!clientConfig) {
        throw new Error('API client not initialized — call initApiClient() before any tool handler.');
    }
    return clientConfig;
};

const buildUrl = (baseUrl, endpoint) => {
    const base = baseUrl.replace(/\/$/, '');
    const path = endpoint.replace(/^\//, '');
    return `${base}/${path}`;
};

const makeApiRequest = async (endpoint, { method = 'GET', body, query } = {}) => {
    const config = requireConfig();
    const cleanedQuery = query
        ? Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null))
        : undefined;

    const response = await axios.request({
        method,
        url: buildUrl(config.baseUrl, endpoint),
        data: body,
        params: cleanedQuery,
        timeout: REQUEST_TIMEOUT_MS,
        auth: { username: config.accessId, password: config.secret },
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    return response.data;
};

const handleApiError = error => {
    if (axios.isAxiosError(error)) {
        const status = error.response && error.response.status;
        const data = (error.response && error.response.data) || undefined;
        const upstreamMessage = data && (data.message || data.error);

        if (status === 400) {
            return upstreamMessage
                ? `Validation error: ${upstreamMessage}`
                : 'Validation error: the upstream API rejected the request body or query parameters.';
        }
        if (status === 401) {
            return 'Authentication failed. Check KANBANZONE_API_KEY — get a fresh one from Org Settings → Integrations → API Key.';
        }
        if (status === 403) {
            return 'Permission denied. The API key is valid but does not have access to this resource.';
        }
        if (status === 404) {
            return upstreamMessage
                ? `Not found: ${upstreamMessage}`
                : 'Not found. Double-check the ID — and for mirror cards, pass the `board` (publicId) parameter.';
        }
        if (status === 429) {
            return 'Rate limit exceeded. Wait a moment before retrying.';
        }
        if (status && status >= 500) {
            return `Upstream API error (${status}). Try again shortly; if it persists this is a Kanban Zone issue.`;
        }
        if (error.code === 'ECONNABORTED') {
            return 'Request timed out. Try again or narrow the request (filters, smaller `count`).';
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return 'Could not reach the Kanban Zone API. Check KANBANZONE_BASE_URL or your network.';
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    return `Unexpected error: ${message}`;
};

const safeRun = async fn => {
    try {
        return await fn();
    } catch (error) {
        return {
            isError: true,
            content: [{ type: 'text', text: handleApiError(error) }],
        };
    }
};

module.exports = {
    initApiClient,
    makeApiRequest,
    handleApiError,
    safeRun,
};
