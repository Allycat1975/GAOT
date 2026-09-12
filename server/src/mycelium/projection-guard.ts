/**
 * A projection is a read model owned by Mycelium, even when its presentation
 * target happens to be a Paperclip record. Generic donor mutations must call
 * this guard before changing such a target.
 */
export type ProjectionTarget = {
  companyId: string;
  localTargetKind: string;
  localTargetId: string;
};

export type ProjectionBindingLookup = {
  isBound(target: ProjectionTarget): Promise<boolean>;
};

export class CanonicalProjectionMutationError extends Error {
  constructor(target: ProjectionTarget) {
    super(
      `GAOT ${target.localTargetKind} ${target.localTargetId} is a Mycelium projection and may only be changed by a projection writer.`,
    );
    this.name = "CanonicalProjectionMutationError";
  }
}

export async function assertGaotMutationAllowed(
  lookup: ProjectionBindingLookup,
  target: ProjectionTarget,
): Promise<void> {
  if (await lookup.isBound(target)) {
    throw new CanonicalProjectionMutationError(target);
  }
}
