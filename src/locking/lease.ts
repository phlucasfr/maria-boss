export interface LeaseInfo {
  jobId: number;
  leaseToken: string;
  leaseOwner: string;
  expiresAt: Date;
}

export function isLeaseExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() <= Date.now();
}
