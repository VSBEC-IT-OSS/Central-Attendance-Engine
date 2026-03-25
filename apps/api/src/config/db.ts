import { PrismaClient } from '@prisma/client';
import { config } from './env';

declare global {
  // allow global var in dev to prevent multiple instances during hot reload
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (config.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
