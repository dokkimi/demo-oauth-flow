import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly oauthDomain: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private prisma: PrismaService) {
    this.oauthDomain = process.env.OAUTH_DOMAIN || 'auth.provider.com';
    this.clientId = process.env.OAUTH_CLIENT_ID || 'demo-client-id';
    this.clientSecret = process.env.OAUTH_CLIENT_SECRET || 'demo-client-secret';
    this.redirectUri =
      process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/callback';
  }

  getAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });
    return `https://${this.oauthDomain}/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
  ): Promise<{ access_token: string; token_type: string }> {
    console.log(`Exchanging authorization code for token`);

    const response = await fetch(`https://${this.oauthDomain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Token exchange failed: ${response.status} ${error}`);
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Token exchange successful`);
    return data;
  }

  async fetchUserInfo(
    accessToken: string,
  ): Promise<{ sub: string; email: string; name: string }> {
    console.log(`Fetching user info from OAuth provider`);

    const response = await fetch(`https://${this.oauthDomain}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Userinfo fetch failed: ${response.status} ${error}`);
      throw new Error(`Userinfo fetch failed: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched user info for: ${data.email}`);
    return data;
  }

  async findOrCreateUser(oauthId: string, email: string, name: string) {
    let user = await this.prisma.user.findUnique({
      where: { oauthId: oauthId },
    });

    if (!user) {
      console.log(`Creating new user: ${email}`);
      user = await this.prisma.user.create({
        data: { oauthId: oauthId, email, name },
      });
    } else {
      console.log(`Found existing user: ${email}`);
    }

    return user;
  }

  generateSessionToken(userId: string): string {
    // Simple HMAC-based session token for the demo
    const payload = JSON.stringify({ userId, iat: Date.now() });
    const encoded = Buffer.from(payload).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.clientSecret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  verifySessionToken(token: string): { userId: string } | null {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) {
      return null;
    }

    const expectedSig = crypto
      .createHmac('sha256', this.clientSecret)
      .update(encoded)
      .digest('base64url');

    if (signature !== expectedSig) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      return { userId: payload.userId };
    } catch {
      return null;
    }
  }
}
