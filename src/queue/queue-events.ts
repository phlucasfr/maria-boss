import { EventEmitter } from 'node:events';
import type { JobData } from '../types/job.js';

export type QueueEventMap = {
  waiting: { jobId: number };
  active: { job: JobData };
  completed: { jobId: number };
  failed: { jobId: number; error: string };
  stalled: { jobId: number };
};

export class QueueEvents extends EventEmitter {
  emit<K extends keyof QueueEventMap>(event: K, payload: QueueEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof QueueEventMap>(event: K, listener: (payload: QueueEventMap[K]) => void): this {
    return super.on(event, listener);
  }
}
