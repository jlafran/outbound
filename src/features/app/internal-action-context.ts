export type InternalActionContext = {
  workspaceId: string;
  actorId: string;
};

export class InternalActionContextError extends Error {
  readonly code = "AUTH_REQUIRED";

  constructor() {
    super("AUTH_REQUIRED");
    this.name = "InternalActionContextError";
  }
}

export async function resolveInternalActionContext(): Promise<InternalActionContext> {
  if (process.env.OUTREACH_E2E_MODE === "1") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("E2E_MODE_FORBIDDEN_IN_PRODUCTION");
    }

    return {
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    };
  }

  throw new InternalActionContextError();
}
