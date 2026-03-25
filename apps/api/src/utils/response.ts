import { FastifyReply } from 'fastify';
import type { ApiSuccessResponse, ApiErrorResponse, PaginationMeta } from '@attendance-engine/schema';

export function ok<T>(reply: FastifyReply, data: T, meta?: PaginationMeta): void {
  const body: ApiSuccessResponse<T> = { success: true, data, ...(meta ? { meta } : {}) };
  reply.status(200).send(body);
}

export function created<T>(reply: FastifyReply, data: T): void {
  reply.status(201).send({ success: true, data });
}

export function fail(reply: FastifyReply, status: number, code: string, message: string, details?: unknown): void {
  const body: ApiErrorResponse = { success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } };
  reply.status(status).send(body);
}

export function notFound(reply: FastifyReply, message = 'Resource not found'): void {
  fail(reply, 404, 'NOT_FOUND', message);
}

export function badRequest(reply: FastifyReply, message: string, details?: unknown): void {
  fail(reply, 400, 'BAD_REQUEST', message, details);
}

export function parsePagination(query: { page?: unknown; limit?: unknown }): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
