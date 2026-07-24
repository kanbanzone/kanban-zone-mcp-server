const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const { initApiClient, makeApiRequest, runWithCredentials } = require('../src/client');

// The stdio path: with no per-call context, requests authenticate with the env credential set by
// initApiClient() at boot — identical to how the local server works today.
test('stdio path: makeApiRequest uses the env credential when there is no call context', async t => {
    process.env.KANBANZONE_API_KEY = 'envAccess:envSecret';
    delete process.env.KANBANZONE_BASE_URL;
    initApiClient();

    const calls = [];
    t.mock.method(axios, 'request', async cfg => {
        calls.push(cfg);
        return { data: { ok: true } };
    });

    const out = await makeApiRequest('/thing', { method: 'GET' });
    assert.deepEqual(out, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].auth, { username: 'envAccess', password: 'envSecret' });
    assert.match(calls[0].url, /integrations\.kanbanzone\.io\/v1\/thing$/);
});

// A host may bind an OAuth bearer token instead of accessId/secret — the request then authenticates
// with an Authorization: Bearer header and no HTTP Basic credentials.
test('runWithCredentials with a bearerToken forwards a Bearer header, not Basic auth', async t => {
    process.env.KANBANZONE_API_KEY = 'envAccess:envSecret';
    initApiClient();

    const calls = [];
    t.mock.method(axios, 'request', async cfg => {
        calls.push(cfg);
        return { data: { ok: true } };
    });

    await runWithCredentials(
        { bearerToken: 'opaque-oauth-token', baseUrl: 'https://integrations.kanbanzone.io/v1' },
        () => makeApiRequest('/thing', { method: 'GET' })
    );

    assert.equal(calls[0].auth, undefined);
    assert.equal(calls[0].headers.Authorization, 'Bearer opaque-oauth-token');
});

// A host serving multiple tenants can bind call-scoped credentials that win inside the scope and
// are restored to the boot singleton the moment the scope ends (no credential leaks across calls).
test('runWithCredentials binds call-scoped credentials, then falls back after', async t => {
    process.env.KANBANZONE_API_KEY = 'envAccess:envSecret';
    initApiClient();

    const calls = [];
    t.mock.method(axios, 'request', async cfg => {
        calls.push(cfg);
        return { data: {} };
    });

    await runWithCredentials(
        { accessId: 'reqAcc', secret: 'reqSek', baseUrl: 'https://integrations.kanbanzone.io/v1' },
        () => makeApiRequest('/scoped', { method: 'GET' })
    );
    await makeApiRequest('/outside', { method: 'GET' });

    assert.deepEqual(calls[0].auth, { username: 'reqAcc', password: 'reqSek' });
    assert.deepEqual(calls[1].auth, { username: 'envAccess', password: 'envSecret' });
});
