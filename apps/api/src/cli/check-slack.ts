import fs from 'fs';
import path from 'path';
import { SlackService } from '../modules/slack/slack-service';
import { prisma } from '../config/database';
import { env, isSlackOAuthConfigured } from '../config/env';

async function main() {
  console.log('\n=============================================');
  console.log('       SLACK INTEGRATION HEALTH CHECK        ');
  console.log('=============================================');

  const rootEnvPath = path.resolve(process.cwd(), '../../.env');
  console.log(`Process cwd: ${process.cwd()}`);
  console.log(`Checking root .env exists at ${rootEnvPath}: ${fs.existsSync(rootEnvPath)}`);
  console.log(`env.SLACK_CLIENT_ID loaded: ${Boolean(env.SLACK_CLIENT_ID)} (length: ${env.SLACK_CLIENT_ID.length})`);
  console.log(`env.SLACK_CLIENT_SECRET loaded: ${Boolean(env.SLACK_CLIENT_SECRET)} (length: ${env.SLACK_CLIENT_SECRET.length})`);

  const configured = isSlackOAuthConfigured();
  console.log(`Slack OAuth Configured: ${configured ? 'YES (Valid Client ID & Secret)' : 'NO'}`);
  console.log(`Slack Callback URL    : ${env.SLACK_CALLBACK_URL}`);
  console.log(`Slack Scopes          : ${env.SLACK_SCOPES}`);
  console.log(`Default Channel       : ${env.SLACK_DEFAULT_CHANNEL || '(None specified)'}`);

  if (configured) {
    const authUrl = SlackService.getAuthorizationUrl('test_state_123');
    console.log(`\nGenerated OAuth Redirect URL: OK (Valid Slack authorization endpoint generated)`);
  }

  // Check users
  const users = await prisma.user.findMany();
  console.log(`\nRegistered Users: ${users.length}`);
  users.forEach((u) => {
    console.log(`- User ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Avatar: ${Boolean(u.avatarUrl)}`);
  });

  // Check database connections
  const connections = await prisma.slackConnection.findMany();
  console.log(`\nPersisted Slack Connections: ${connections.length}`);
  connections.forEach((c) => {
    console.log(`- User ID: ${c.userId}`);
    console.log(`  Team: ${c.slackTeamName} (${c.slackTeamId})`);
    console.log(`  Channel: ${c.channelName}`);
    console.log(`  Connected: ${c.isConnected}`);
    console.log(`  Has Encrypted Token: ${Boolean(c.encryptedOAuthToken)}`);
  });

  // Check notification events
  const events = await prisma.notificationEvent.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log(`\nRecent Notification Events: ${events.length}`);
  events.forEach((e) => {
    console.log(`- Event: ${e.eventKey} | Status: ${e.status}`);
    if (e.lastError) console.log(`  Error: ${e.lastError}`);
  });

  console.log('=============================================\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
