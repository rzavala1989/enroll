import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [
    // 5-minute in-memory cache for the list endpoint. CacheInterceptor
    // keys by request URL, so filter combinations get distinct entries.
    CacheModule.register({ ttl: 300_000, max: 200 }),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
