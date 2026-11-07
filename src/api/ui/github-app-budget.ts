import { GitHubAppAuthError } from './github-app-auth.js';

export class GitHubAppComintyBudget {
  private readonly users = new Map<string, { count: number; until: number }>();
  private global = { count: 0, until: 0 };
  constructor(
    private readonly maxPerUserHour = 5,
    private readonly maxGlobalDay = 15,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(maxPerUserHour) || maxPerUserHour <= 0 ||
        !Number.isInteger(maxGlobalDay) || maxGlobalDay <= 0) {
      throw new Error('Cominty credit limits must be positive integers.');
    }
  }
  reserve(githubPrincipalId: string, estimatedCalls: number): void {
    const now = this.now();
    const stored = this.users.get(githubPrincipalId);
    const user = stored && stored.until > now ? stored : { count: 0, until: now + 3_600_000 };
    const global = this.global.until > now ? this.global : { count: 0, until: now + 86_400_000 };
    if (user.count + estimatedCalls > this.maxPerUserHour ||
        global.count + estimatedCalls > this.maxGlobalDay) {
      throw new GitHubAppAuthError(429, 'Cominty demo call limit reached. No new paid agent request was sent.');
    }
    user.count += estimatedCalls;
    global.count += estimatedCalls;
    this.users.set(githubPrincipalId, user);
    this.global = global;
    for (const [key, entry] of this.users) if (entry.until <= now) this.users.delete(key);
  }
}
