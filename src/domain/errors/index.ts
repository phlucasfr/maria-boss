export class MariaBossError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MariaBossError';
  }
}

export class JobNotFoundError extends MariaBossError {
  constructor(id: number) {
    super(`Job ${id} not found`, 'JOB_NOT_FOUND');
  }
}

export class DuplicateJobError extends MariaBossError {
  constructor() {
    super('Duplicate job with the same idempotency key', 'DUPLICATE_JOB');
  }
}

export class QueueClosedError extends MariaBossError {
  constructor() {
    super('Queue or worker is closed', 'QUEUE_CLOSED');
  }
}

export class PayloadTooLargeError extends MariaBossError {
  constructor(maxBytes: number) {
    super(`Payload exceeds maximum size of ${maxBytes} bytes`, 'PAYLOAD_TOO_LARGE');
  }
}

export class ValidationError extends MariaBossError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
