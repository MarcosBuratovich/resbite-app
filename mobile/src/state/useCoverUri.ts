import { useEffect, useState } from "react";
import { signedCovers } from "../services/planCovers";

/** Preview covers are in-memory data URIs; stored covers use cached short-lived signed links. */
export function useCoverUri(path: string | null): string | null {
  const inline = path?.startsWith("data:image/") ? path : null;
  const [signed, setSigned] = useState<{ path: string; uri: string } | null>(() => {
    const cached = path && !inline ? signedCovers.peek(path) : null;
    return cached && path ? { path, uri: cached } : null;
  });
  useEffect(() => {
    if (!path || inline) return;
    let active = true;
    signedCovers.get(path).then(
      (uri) => {
        if (active) setSigned({ path, uri });
      },
      () => {
        if (active) setSigned(null);
      },
    );
    return () => {
      active = false;
    };
  }, [path, inline]);
  return inline ?? (signed && signed.path === path ? signed.uri : null);
}
