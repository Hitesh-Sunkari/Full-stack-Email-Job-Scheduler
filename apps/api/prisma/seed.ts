import { PrismaClient, CampaignStatus, EmailStatus } from '@prisma/client';
import { SmtpService } from '../src/modules/emails/smtp-service';
import { encryptToken, generateHash } from '../src/lib/crypto';
import { env } from '../src/config/env';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial database state...');

  // 1. Create Demo User
  const demoUser = await prisma.user.upsert({
    where: { googleSub: 'google-demo-reachinbox-sub-001' },
    create: {
      googleSub: 'google-demo-reachinbox-sub-001',
      email: 'demo@reachinbox.ai',
      name: 'ReachInbox Demo User',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&fit=crop&crop=faces',
    },
    update: {},
  });

  console.log(`Demo User created: ${demoUser.email} (${demoUser.id})`);

  // 2. Generate or setup Ethereal Sender Account
  console.log('Creating Ethereal test SMTP credentials...');
  const ethereal = await SmtpService.createEtherealAccount();
  const encryptedPass = encryptToken(ethereal.pass, env.TOKEN_ENCRYPTION_KEY);

  const sender = await prisma.senderAccount.upsert({
    where: {
      userId_senderEmail: {
        userId: demoUser.id,
        senderEmail: ethereal.user,
      },
    },
    create: {
      userId: demoUser.id,
      senderEmail: ethereal.user,
      displayName: 'ReachInbox Outbox (Ethereal)',
      smtpHost: ethereal.host,
      smtpPort: ethereal.port,
      smtpSecure: false,
      smtpUser: ethereal.user,
      encryptedSmtpPass: encryptedPass,
      isActive: true,
    },
    update: {
      encryptedSmtpPass: encryptedPass,
    },
  });

  console.log(`Ethereal Sender Account created: ${sender.senderEmail}`);

  // 3. Create Sample Campaign
  const campaign = await prisma.emailCampaign.create({
    data: {
      userId: demoUser.id,
      senderId: sender.id,
      subject: 'Welcome to ReachInbox High-Performance Cold Outreach',
      body: '<p>Hi {{name}},</p><p>We are thrilled to welcome you to <strong>ReachInbox</strong>! Reach thousands of prospects with smart rate limiting and automated queue dispatch.</p><p>Best,<br>The ReachInbox Team</p>',
      startTime: new Date(Date.now() + 60000), // 1 minute in the future
      configuredDelayMs: 2000,
      hourlyLimit: 200,
      status: CampaignStatus.ACTIVE,
      totalRecipients: 3,
    },
  });

  // 4. Create Sample Scheduled Emails
  const sampleRecipients = [
    'prospect.alex@example.com',
    'sarah.founder@techstartup.io',
    'growth.lead@enterprise.org',
  ];

  for (let i = 0; i < sampleRecipients.length; i++) {
    const recipient = sampleRecipients[i];
    const scheduledAt = new Date(Date.now() + (i + 1) * 30000); // 30s, 60s, 90s
    const idempotencyKey = generateHash(`seed:campaign:${campaign.id}:recip:${recipient}`);

    await prisma.scheduledEmail.create({
      data: {
        campaignId: campaign.id,
        userId: demoUser.id,
        senderId: sender.id,
        recipient,
        subject: campaign.subject,
        body: campaign.body,
        scheduledAt,
        status: EmailStatus.SCHEDULED,
        idempotencyKey,
      },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
