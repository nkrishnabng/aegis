import type { Request, Response } from "express";
import type { ProjectRole } from "@testingmcp/shared";
import { getEffectiveProjectRole } from "../db/projectMemberRepo";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by projectsRouter's `:id` param middleware -- the requesting
       * user's effective role on that project. Only present on routes
       * whose path includes a `:id` project-id param. */
      projectRole?: ProjectRole;
    }
  }
}

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, reviewer: 1, editor: 2, owner: 3 };

/** True if `role` meets or exceeds `minRole` in the viewer < reviewer <
 * editor < owner hierarchy. Note this is the wrong tool for gating the
 * approve/reject action itself -- reviewer's rank sits below editor only so
 * it inherits read/run access, not editor's content-edit rights, but that
 * also means `roleMeets(role, "reviewer")` is true for editor/owner too.
 * Approve/reject uses an explicit `role === "owner" || role === "reviewer"`
 * check instead (see testcases.ts's /review route). */
export function roleMeets(role: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** True if `role` is allowed to approve/reject a test case at all (subject
 * to the separate "not your own test case" check at the call site). Editor
 * is deliberately excluded even though it outranks reviewer -- authoring and
 * approving are meant to be separate capabilities. */
export function canReviewTestCases(role: ProjectRole): boolean {
  return role === "owner" || role === "reviewer";
}

/** Resolves the requesting user's role on a project and 403s (with a
 * descriptive message) if they have none, or less than `minRole`. Returns
 * the role on success so callers can branch further if needed (e.g. show
 * extra UI-relevant state). Callers must `return` immediately when this
 * resolves to null -- the response has already been sent. */
export async function requireProjectRole(
  req: Request,
  res: Response,
  projectId: string,
  minRole: ProjectRole,
): Promise<ProjectRole | null> {
  const role = await getEffectiveProjectRole(req.user!, projectId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this project." });
    return null;
  }
  if (!roleMeets(role, minRole)) {
    res.status(403).json({ error: `This action requires at least "${minRole}" access to this project.` });
    return null;
  }
  return role;
}
