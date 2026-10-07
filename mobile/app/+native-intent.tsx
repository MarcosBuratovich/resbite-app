import { routeSystemLink } from "../src/domain/appLinks";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return routeSystemLink(path, process.env.EXPO_PUBLIC_INVITATION_ORIGIN);
}
