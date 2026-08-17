import {
  TeamSessionSchema,
  type TeamSession,
} from "@/lib/ai/teamProfileRead";

export const TEAM_SESSION_STORAGE_KEY = "donghaengori.team.session";

export function readTeamSession(storage: Pick<Storage, "getItem">): TeamSession | null {
  const raw = storage.getItem(TEAM_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = TeamSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeTeamSession(
  storage: Pick<Storage, "setItem">,
  session: TeamSession,
) {
  storage.setItem(TEAM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearTeamSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(TEAM_SESSION_STORAGE_KEY);
}
