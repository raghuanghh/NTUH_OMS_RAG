import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('NTUH OMS RAG Worker', () => {
  it('未知路由回傳 404', async () => {
    const request = new IncomingRequest('http://example.com/unknown-path');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it('/chat/init 回傳包含 id 的 JSON', async () => {
    const request = new IncomingRequest('http://example.com/chat/init');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = await response.json() as { id: string };
    expect(typeof body.id).toBe('string');
  });

  it('/chat/:id DELETE 清除對話回傳 success', async () => {
    const request = new IncomingRequest('http://example.com/chat/test-id', { method: 'DELETE' });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    const body = await response.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});
