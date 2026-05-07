import {
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import * as crypto from 'crypto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('login')
  login(@Res() res: Response) {
    const state = crypto.randomBytes(16).toString('hex');
    const authorizeUrl = this.authService.getAuthorizeUrl(state);
    console.log(`Redirecting to OAuth provider for login`);
    res.redirect(302, authorizeUrl);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') _state: string) {
    if (!code) {
      throw new UnauthorizedException('Missing authorization code');
    }

    console.log(`Received OAuth callback with code`);

    try {
      // Step 1: Exchange code for access token
      const tokenData = await this.authService.exchangeCodeForToken(code);

      // Step 2: Fetch user info with the access token
      const userInfo = await this.authService.fetchUserInfo(
        tokenData.access_token,
      );

      // Step 3: Create or find user in our database
      const user = await this.authService.findOrCreateUser(
        userInfo.sub,
        userInfo.email,
        userInfo.name,
      );

      // Step 4: Generate our own session token
      const sessionToken = this.authService.generateSessionToken(user.id);

      console.log(`OAuth flow complete for user: ${userInfo.email}`);

      return {
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    } catch (error) {
      console.error(`OAuth callback failed: ${error.message}`);
      throw new InternalServerErrorException('Authentication failed');
    }
  }
}
