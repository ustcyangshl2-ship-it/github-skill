export type Grant = { status: string; startsAt: Date; expiresAt: Date };
export function hasMembership(grants: Grant[], now = new Date()): boolean {
  return grants.some(g => g.status === "ACTIVE" && g.startsAt <= now && now < g.expiresAt);
}
export function canReadTutorial(access: "FREE" | "MEMBER", grants: Grant[], now = new Date()) {
  return access === "FREE" || hasMembership(grants, now);
}
export function canManageContent(role: string | undefined) { return role === "ADMIN" || role === "EDITOR"; }
