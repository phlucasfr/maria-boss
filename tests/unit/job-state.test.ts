import { describe, it, expect } from 'vitest';
import { canTransition, isTerminal } from '../../src/domain/job/job-state.js';

describe('job state machine', () => {
  it('allows pending to active', () => {
    expect(canTransition('pending', 'active')).toBe(true);
  });

  it('rejects completed transitions', () => {
    expect(canTransition('completed', 'pending')).toBe(false);
  });

  it('identifies terminal states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('active')).toBe(false);
  });
});
