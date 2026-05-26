import type { JobState } from '../../types/job.js';

const transitions: Record<JobState, JobState[]> = {
  pending: ['active', 'cancelled', 'delayed'],
  delayed: ['pending', 'cancelled'],
  active: ['completed', 'failed', 'pending'],
  completed: [],
  failed: ['pending'],
  cancelled: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return transitions[from].includes(to);
}

export function isTerminal(state: JobState): boolean {
  return state === 'completed' || state === 'cancelled';
}
