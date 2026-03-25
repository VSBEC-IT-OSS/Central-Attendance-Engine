import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/db';

// Logs API calls to api_access_logs table for audit trail
export async function accessLogger(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.addHook?.('onSend', async (_req, _rep) => {});

  const start = Date.now();

  reply.raw.on('finish', () => {
    const durationMs = Date.now() - start;
    const apiKeyId = request.apiKeyRecord?.id ?? null;

    // Fire-and-forget — never block the response
    prisma.apiAccessLog
      .create({
        data: {
          apiKeyId,
          endpoint: request.url,
          method: request.method,
          statusCode: reply.statusCode,
          durationMs,
          ipAddress: request.ip,
        },
      })
      .catch(() => {});
  });
}
