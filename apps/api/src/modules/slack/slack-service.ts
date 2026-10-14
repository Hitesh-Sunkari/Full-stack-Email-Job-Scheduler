import { WebClient } from '@slack/web-api';
import { prisma } from '../../config/database';
import { env, isSlackOAuthConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { encryptToken, decryptToken } from '../../lib/crypto';
import { NotificationStatus } from '@prisma/client';

export class SlackService {
  /**
   * Generates genuine Slack OAuth authorization redirect URL.
   */
  static getAuthorizationUrl(state: string): string {
    if (!isSlackOAuthConfigured()) {
      throw new Error('Slack integration is not configured with valid Client ID and Secret.');
    }

    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      scope: env.SLACK_SCOPES,
      redirect_uri: env.SLACK_CALLBACK_URL,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for permanent access token.
   */
  static async handleOAuthCallback(code: string, userId: string): Promise<{ teamName: string; channel: string }> {
    if (!isSlackOAuthConfigured()) {
      throw new Error('Slack integration is not configured with valid Client ID and Secret.');
    }

    const client = new WebClient();
    const response = await client.oauth.v2.access({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_CALLBACK_URL,
    });

    if (!response.ok || !response.access_token) {
      throw new Error(`Slack OAuth failed: ${response.error || 'Unknown error'}`);
    }

    const accessToken = response.access_token as string;
    const teamId = response.team?.id || 'unknown_team';
    const teamName = response.team?.name || 'Slack Workspace';
    const incomingWebhookChannel = response.incoming_webhook?.channel || env.SLACK_DEFAULT_CHANNEL;

    const encryptedToken = encryptToken(accessToken, env.TOKEN_ENCRYPTION_KEY);

    // Upsert connection for user
    await prisma.slackConnection.upsert({
      where: { userId },
      create: {
        userId,
        slackTeamId: teamId,
        slackTeamName: teamName,
        channelName: incomingWebhookChannel,
        encryptedOAuthToken: encryptedToken,
        isConnected: true,
      },
      update: {
        slackTeamId: teamId,
        slackTeamName: teamName,
        channelName: incomingWebhookChannel,
        encryptedOAuthToken: encryptedToken,
        isConnected: true,
      },
    });

    logger.info({ userId, teamName }, 'Successfully saved Slack connection for user');
    return { teamName, channel: incomingWebhookChannel };
  }

  /**
   * Retrieves Slack connection status for tenant.
   */
  static async getConnectionStatus(userId: string) {
    const connection = await prisma.slackConnection.findUnique({
      where: { userId },
    });

    return {
      isConfigured: isSlackOAuthConfigured(),
      isConnected: Boolean(connection && connection.isConnected),
      teamName: connection?.slackTeamName || null,
      channel: connection?.channelName || null,
      updatedAt: connection?.updatedAt || null,
    };
  }

  /**
   * Disconnects Slack connection for tenant.
   */
  static async disconnect(userId: string): Promise<void> {
    await prisma.slackConnection.updateMany({
      where: { userId },
      data: { isConnected: false },
    });
    logger.info({ userId }, 'Slack integration disconnected for user');
  }

  /**
   * Sends durable, deduplicated rate-limit warning notification to Slack.
   */
  static async sendRateLimitNotification(params: {
    tenantId: string;
    senderId: string;
    senderEmail: string;
    hourlyLimit: number;
    windowKey: string;
    nextEligibleTime: Date;
    force?: boolean;
  }): Promise<boolean> {
    const { tenantId, senderId, senderEmail, hourlyLimit, windowKey, nextEligibleTime, force } = params;
    const eventKey = force ? `rate_limit_test:${senderId}:${Date.now()}` : `rate_limit:${senderId}:${windowKey}`;

    // Deduplication via NotificationEvent in PostgreSQL
    if (!force) {
      const existing = await prisma.notificationEvent.findUnique({
        where: { eventKey },
      });

      if (existing && existing.status === NotificationStatus.SENT) {
        logger.debug({ eventKey }, 'Slack notification already sent for this window; skipping duplicate.');
        return false;
      }
    }

    // Upsert pending event
    const event = await prisma.notificationEvent.upsert({
      where: { eventKey },
      create: {
        tenantId,
        senderId,
        rateLimitWindow: windowKey,
        eventKey,
        status: NotificationStatus.PENDING,
      },
      update: {},
    });

    // Check if Slack is connected for this tenant
    const slackConn = await prisma.slackConnection.findUnique({
      where: { userId: tenantId },
    });

    if (!slackConn || !slackConn.isConnected || !slackConn.encryptedOAuthToken) {
      logger.info({ tenantId, senderEmail }, 'Slack not connected for tenant; rate-limit event recorded without notification.');
      return false;
    }

    try {
      const accessToken = decryptToken(slackConn.encryptedOAuthToken, env.TOKEN_ENCRYPTION_KEY);
      const client = new WebClient(accessToken);
      const destinationChannel = slackConn.channelName || env.SLACK_DEFAULT_CHANNEL;

      const formattedNextTime = nextEligibleTime.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      await client.chat.postMessage({
        channel: destinationChannel,
        text: `⚠️ ReachInbox Hourly Rate Limit Reached for ${senderEmail}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ ReachInbox Hourly Rate Limit Warning',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Sender Account:*\n\`${senderEmail}\``,
              },
              {
                type: 'mrkdwn',
                text: `*Hourly Quota:*\n${hourlyLimit} emails/hour`,
              },
              {
                type: 'mrkdwn',
                text: `*Hour Window:*\n\`${windowKey}\``,
              },
              {
                type: 'mrkdwn',
                text: `*Automatic Deferral:*\n${formattedNextTime}`,
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Email jobs exceeding quota have been safely re-queued and deferred without dropping.',
              },
            ],
          },
        ],
      });

      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: NotificationStatus.SENT, lastError: null },
      });

      logger.info({ eventKey, senderEmail }, 'Slack rate limit notification delivered successfully');
      return true;
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error({ error: errorMsg, eventKey }, 'Failed to deliver Slack notification');

      await prisma.notificationEvent.update({
        where: { id: event.id },
        data: { status: NotificationStatus.FAILED, lastError: errorMsg },
      });

      return false;
    }
  }
}
