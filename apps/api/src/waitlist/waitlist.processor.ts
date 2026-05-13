import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PROMOTE_WAITLIST_QUEUE, WaitlistService } from './waitlist.service';

interface PromotePayload {
  sectionId: string;
}

@Processor(PROMOTE_WAITLIST_QUEUE)
export class WaitlistProcessor extends WorkerHost {
  private readonly logger = new Logger(WaitlistProcessor.name);

  constructor(private readonly waitlist: WaitlistService) {
    super();
  }

  async process(job: Job<PromotePayload>): Promise<void> {
    const { sectionId } = job.data;
    try {
      await this.waitlist.runPromotion(sectionId);
    } catch (err) {
      this.logger.error(
        `Waitlist promotion failed for section ${sectionId}.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err; // let BullMQ record the failure (removeOnFail keeps the last 100)
    }
  }
}
