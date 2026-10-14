import { prisma } from '../../config/database';
import { env, isGoogleOAuthConfigured } from '../../config/env';
import { logger } from '../../config/logger';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export class AuthService {
  /**
   * Generates Google OAuth 2.0 authorization URL.
   */
  static getGoogleAuthUrl(state: string): string {
    if (!isGoogleOAuthConfigured()) {
      throw new Error(
        'Google OAuth is not configured. Please supply GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
      );
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      state,
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code with Google for tokens, fetches userinfo,
   * and persists or updates the user in PostgreSQL using Google's stable subject ID (sub).
   */
  static async handleGoogleCallback(code: string): Promise<import('@prisma/client').User> {
    if (!isGoogleOAuthConfigured()) {
      throw new Error('Google OAuth is not configured with valid credentials.');
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error({ errorText }, 'Google token exchange failed');
      throw new Error('Failed to exchange authorization code with Google');
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; id_token: string };

    // 2. Fetch user profile with access token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user profile from Google');
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

    if (!userInfo.email || !userInfo.sub) {
      throw new Error('Google userinfo response did not contain required email or subject identifier');
    }

    // 3. Upsert user in PostgreSQL using Google's stable subject ID (sub)
    const user = await prisma.user.upsert({
      where: { googleSub: userInfo.sub },
      create: {
        googleSub: userInfo.sub,
        email: userInfo.email.toLowerCase(),
        name: userInfo.name || userInfo.email.split('@')[0],
        avatarUrl: userInfo.picture || null,
      },
      update: {
        email: userInfo.email.toLowerCase(),
        name: userInfo.name || undefined,
        avatarUrl: userInfo.picture || undefined,
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'User logged in via Google OAuth');
    return user;
  }

  /**
   * Retrieves authenticated user details by tenant/user ID.
   */
  static async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        googleSub: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
