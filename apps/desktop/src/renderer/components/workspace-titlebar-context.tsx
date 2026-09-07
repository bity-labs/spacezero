import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

interface WorkspaceTitlebarContextValue {
  readonly setCenterContent: Dispatch<SetStateAction<ReactNode | null>>;
}

const WorkspaceTitlebarContext =
  createContext<WorkspaceTitlebarContextValue | null>(null);

export const WorkspaceTitlebarProvider = WorkspaceTitlebarContext.Provider;

/**
 * Lets route-owned surfaces replace the app titlebar center with contextual,
 * renderer-only controls while the root shell keeps native window ownership.
 */
export function useWorkspaceTitlebarCenter(content: ReactNode): void {
  const context = useContext(WorkspaceTitlebarContext);

  useEffect(() => {
    if (!context) return undefined;
    context.setCenterContent(content);
    return () => context.setCenterContent(null);
  }, [content, context]);
}
