import test from 'node:test';
import assert from 'node:assert/strict';
import { authSummary, maintainAuth } from '../scripts/feishu-auth-maintenance.mjs';

test('auth maintenance requires verified user and offline refresh scope without disclosing credentials', () => {
  const auth = { verified:true, secret:'never-log-me', identities:{ user:{verified:true,status:'ready',tokenStatus:'valid',scope:'offline_access base:app:read',expiresAt:'2026-09-07T19:23:34+08:00',accessToken:'never-log-me'} } };
  assert.equal(authSummary(auth).status,'ready');
  assert.ok(!JSON.stringify(authSummary(auth)).includes('never-log-me'));
  auth.identities.user.scope='base:app:read';
  assert.equal(authSummary(auth).status,'offline_access_missing');
  auth.identities.user.tokenStatus='expired';
  assert.equal(authSummary(auth).status,'reauthorization_required');
});
test('auth verification failures never forward raw CLI errors', async () => {
  assert.deepEqual(await maintainAuth(async()=>{throw new Error('access-token-secret');}),{status:'verification_failed'});
  assert.deepEqual(await maintainAuth(async()=>({stdout:'not-json secret'})),{status:'verification_failed'});
});
