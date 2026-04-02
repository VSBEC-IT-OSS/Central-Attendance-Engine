import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/db';

export const accessLogger = async (fastify: FastifyInstance) => {
  // FIXED: Hooks must be added to the FastifyInstance, not FastifyReply
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const durationMs = Math.round(reply.elapsedTime);
    
    // Using type casting safely for custom decorators
    const apiKeyId = (request as any).apiKeyRecord?.id ?? null;

    // Fire-and-forget logging
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
      .catch((err) => {
        fastify.log.error({ err }, 'Failed to save access log to database');
      });
  });
};