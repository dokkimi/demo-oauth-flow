import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service';

@Controller('api/posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get()
  async listPosts() {
    const posts = await this.postsService.getPublishedPosts();
    return { posts };
  }

  @Get(':id')
  async getPost(@Param('id') id: string) {
    const post = await this.postsService.getPostById(id);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }
}
