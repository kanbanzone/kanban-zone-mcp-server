const { z } = require('zod');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./constants');

const objectIdField = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a 24-character MongoDB ObjectId');

// Boards are addressed by publicId (e.g. "OeMrbG8g") in the public API, not by ObjectId.
const boardPublicIdField = z.string().regex(/^[A-Za-z0-9]{6,12}$/, 'Must be a board publicId (e.g. "OeMrbG8g")');

const pageField = z.number().int().min(1).default(1).describe('1-based page number.');

const countField = z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Items per page (1-${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE}).`);

const isoDateField = z.string().refine(value => !Number.isNaN(Date.parse(value)), {
    message: 'Must be an ISO-8601 date or datetime string',
});

module.exports = {
    objectIdField,
    boardPublicIdField,
    pageField,
    countField,
    isoDateField,
};
