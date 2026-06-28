import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { MongoAbility } from '@casl/ability';

export type AppAbility = MongoAbility<[string, string]>;

/**
 * Builds a CASL ability from a flat array of permission strings.
 * Each permission is "action:subject" (e.g. "read:job-card").
 */
export function buildAbility(permissions: string[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const perm of permissions) {
    const colonIdx = perm.indexOf(':');
    if (colonIdx === -1) continue;
    const action = perm.slice(0, colonIdx);
    const subject = perm.slice(colonIdx + 1);
    can(action, subject);
  }
  return build();
}