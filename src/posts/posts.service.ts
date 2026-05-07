import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  async getPublishedPosts() {
    console.log('Fetching published posts');
    return this.prisma.post.findMany({
      where: { published: true },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPostById(id: string) {
    return this.prisma.post.findUnique({
      where: { id },
      include: { author: { select: { name: true, email: true } } },
    });
  }
}
