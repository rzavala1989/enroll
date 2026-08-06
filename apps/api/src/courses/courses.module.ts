import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  // The cache store is registered once in CommonModule (Redis-backed,
  // shared across replicas) rather than per feature module.
  imports: [
    AuthModule,
    // computeRank for the viewer's waitlist standing on course detail.
    WaitlistModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
