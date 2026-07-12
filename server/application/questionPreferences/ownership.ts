interface PreferenceIdentity {
  id: string;
  roleKey: string;
  level: string;
  conceptKey: string;
  updatedAt: Date;
}

export function planAnonymousPreferenceMigration(
  anonymous: PreferenceIdentity[],
  user: PreferenceIdentity[]
): {
  attachIds: string[];
  replace: Array<{ sourceId: string; targetId: string }>;
  deleteIds: string[];
} {
  const userByConcept = new Map(
    user.map((item) => [identityKey(item), item] as const)
  );
  const attachIds: string[] = [];
  const replace: Array<{ sourceId: string; targetId: string }> = [];
  const deleteIds: string[] = [];

  for (const item of anonymous) {
    const existing = userByConcept.get(identityKey(item));
    if (!existing) {
      attachIds.push(item.id);
      continue;
    }
    if (item.updatedAt.getTime() > existing.updatedAt.getTime()) {
      replace.push({ sourceId: item.id, targetId: existing.id });
    } else {
      deleteIds.push(item.id);
    }
  }
  return { attachIds, replace, deleteIds };
}

function identityKey(item: PreferenceIdentity): string {
  return `${item.roleKey}\u0000${item.level}\u0000${item.conceptKey}`;
}
