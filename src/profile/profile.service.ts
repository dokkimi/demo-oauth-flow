import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfileWithPosts(userId: string) {
    console.log(`Fetching profile for user: ${userId}`);
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { posts: true },
    });
  }

  async createPost(userId: string, title: string, content: string) {
    console.log(`Creating post for user: ${userId}`);
    return this.prisma.post.create({
      data: {
        title,
        content,
        published: true,
        authorId: userId,
      },
    });
  }
}
