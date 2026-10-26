import type { VersionConflictError } from "./repository";
import type { ConflictPayload } from "./schema";

export function toConflictPayload(error: VersionConflictError): ConflictPayload {
  return {
    error: { code: "VERSION_CONFLICT", message: "此列已被修改，請選擇要保留的版本" },
    conflict: {
      baseVersion: error.baseVersion,
      baseHash: error.baseHash,
      mine: error.mine,
      current: error.current,
    },
  };
}
