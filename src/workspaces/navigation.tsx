import { useCallback } from "react";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useNavigate as useRouterNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type To,
} from "react-router-dom";
import { useOptionalWorkspace } from "./context";
export function useWorkspacePath() {
  const workspaceId = useOptionalWorkspace()?.current.id;
  return useCallback(
    (to: To): To =>
      typeof to === "string" &&
      /^\/app(?:\/|$)/.test(to) &&
      !/^\/app\/(w\/|workspaces\/|invitations\/)/.test(to) &&
      workspaceId
        ? `/app/w/${workspaceId}${to.slice(4)}`
        : to,
    [workspaceId],
  );
}
export function Link(props: LinkProps) {
  const path = useWorkspacePath();
  return <RouterLink {...props} to={path(props.to)} />;
}
export function NavLink(props: NavLinkProps) {
  const path = useWorkspacePath();
  return <RouterNavLink {...props} to={path(props.to)} />;
}
export function useNavigate() {
  const navigate = useRouterNavigate(),
    path = useWorkspacePath();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") navigate(to);
      else navigate(path(to), options);
    },
    [navigate, path],
  );
}
