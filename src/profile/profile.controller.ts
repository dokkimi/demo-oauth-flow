import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  async getProfile(@Req() req: any) {
    const user = req.user;
    const profile = await this.profileService.getProfileWithPosts(user.id);
    return { profile };
  }

  @Post('posts')
  async createPost(
    @Req() req: any,
    @Body() body: { title: string; content: string },
  ) {
    const user = req.user;
    const post = await this.profileService.createPost(
      user.id,
      body.title,
      body.content,
    );
    return { post };
  }
}
