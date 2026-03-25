import { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { prisma } from '../config/db';
import { cache } from '../config/redis';

// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware
//
// Two auth modes:
//  1. JWT Bearer token  — admin dashboard users (full access)
//  2. X-API-Key header  — consumer apps (scoped permissions)
//
// API keys are stored as SHA-256 hashes. We hash the incoming key and compare.
// We cache valid key lookups for 5 minutes to avoid DB hits on every request.
// ─────────────────────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    authType?: 'jwt' | 'apikey';
    apiKeyRecord?: {
      id: string;
      name: string;
      permissions: string[];
    };
  }
}

// Auth for dashboard routes (JWT required)
export async function requireJwt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    request.authType = 'jwt';
  } catch {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

// Auth for public API routes (API key required)
export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const rawKey = request.headers['x-api-key'] as string | undefined;

  if (!rawKey) {
    reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'X-API-Key header required' } });
    return;
  }

  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const cacheKey = `apikey:${keyHash}`;

  // Try cache first
  let keyRecord = await cache.get<{ id: string; name: string; permissions: string[] }>(cacheKey);

  if (!keyRecord) {
    const dbKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: { id: true, name: true, permissions: true, isActive: true },
    });

    if (!dbKey || !dbKey.isActive) {
      reply.status(401).send({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } });
      return;
    }

    keyRecord = { id: dbKey.id, name: dbKey.name, permissions: dbKey.permissions };
    await cache.set(cacheKey, keyRecord, 300);

    // Update lastUsedAt non-blocking
    prisma.apiKey.update({
      where: { id: dbKey.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});
  }

  request.authType = 'apikey';
  request.apiKeyRecord = keyRecord;
}

// Check specific permission
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.authType === 'jwt') return; // jwt = admin, all permissions

    const perms = request.apiKeyRecord?.permissions ?? [];
    if (!perms.includes(permission) && !perms.includes('*')) {
      reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: `This API key lacks permission: ${permission}` },
      });
    }
  };
}

// Either JWT or API key accepted
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  if (apiKey) {
    return requireApiKey(request, reply);
  }
  return requireJwt(request, reply);
}
