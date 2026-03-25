import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { config } from './env';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Admin user
  const email = config.ADMIN_EMAIL ?? 'admin@college.edu';
  const password = config.ADMIN_PASSWORD ?? 'Admin@123';

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.create({ data: { email, passwordHash, name: 'System Admin' } });
    console.log(`✅ Admin user created: ${email}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${email}`);
  }

  // Demo API key for WhatsApp bot
  const keyName = 'whatsapp-bot';
  const existingKey = await prisma.apiKey.findUnique({ where: { name: keyName } });
  if (!existingKey) {
    const rawKey = `ae_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await prisma.apiKey.create({
      data: {
        name: keyName,
        keyHash,
        keyPrefix: rawKey.substring(0, 10),
        permissions: ['attendance:read', 'summary:read'],
      },
    });
    console.log(`✅ Demo API key created for "${keyName}"`);
    console.log(`🔑 Key (save this): ${rawKey}`);
  }

  // Demo API key for dashboard
  const dashKey = 'dashboard-app';
  const existingDash = await prisma.apiKey.findUnique({ where: { name: dashKey } });
  if (!existingDash) {
    const rawKey = `ae_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await prisma.apiKey.create({
      data: {
        name: dashKey,
        keyHash,
        keyPrefix: rawKey.substring(0, 10),
        permissions: ['attendance:read', 'summary:read'],
      },
    });
    console.log(`✅ Demo API key created for "${dashKey}"`);
    console.log(`🔑 Key (save this): ${rawKey}`);
  }

  await prisma.systemEvent.create({
    data: { type: 'SYSTEM_STARTUP', severity: 'INFO', message: 'Database seeded successfully' },
  });

  console.log('\n✨ Seed complete!');
  console.log(`\nAdmin login:\n  Email: ${email}\n  Password: ${password}`);
  console.log('\n⚠️  Change the admin password immediately after first login.');
}

seed()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
