import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import type {
  AgentToolDisplayContent,
  AgentToolDisplayResult,
  AgentToolImageMimeType,
  AgentToolJsonObject,
  AgentToolJsonValue,
} from "./conversation.model.js";

export interface PublicToolContentPolicyInput {
  readonly worktreeRoot?: string;
  readonly protectedPathRoots?: readonly string[];
  readonly protectedSecretValues?: readonly string[];
}

const redacted = "[redacted]";
const omittedProtectedPath = "[omitted protected path]";

const sensitiveKey =
  /(?:api[_-]?key|authorization|credential|password|refresh[_-]?token|secret|token)/iu;
const pathKey =
  /(?:^path$|file|directory|cwd|workingDirectory|sourcePath|destinationPath|fullOutputPath|transcript)/iu;

const unique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.length > 0)),
];

const normalizeRoot = (path: string): string => resolve(path);

const isInside = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const displayWorktreePath = (root: string, candidate: string): string => {
  const rel = relative(root, candidate).split(sep).join("/");
  return rel.length === 0 ? "." : rel;
};

const absolutePathPattern = /(?:~|\/)[^\s`'"<>\])}]*/gu;
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const supportedImageMimeTypes = new Set<AgentToolImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const safeTypeLabelPattern = /^[a-z0-9][a-z0-9+./_-]{0,63}$/iu;

export interface PublicToolContentPolicy {
  readonly sanitizeJsonObject: (
    value: unknown,
  ) => AgentToolJsonObject | undefined;
  readonly sanitizeResult: (
    value: unknown,
  ) => AgentToolDisplayResult | undefined;
}

export const createPublicToolContentPolicy = ({
  worktreeRoot,
  protectedPathRoots = [],
  protectedSecretValues = [],
}: PublicToolContentPolicyInput): PublicToolContentPolicy => {
  const canonicalWorktreeRoot = worktreeRoot
    ? normalizeRoot(worktreeRoot)
    : undefined;
  const protectedRoots = unique([tmpdir(), ...protectedPathRoots]).map(
    normalizeRoot,
  );
  const secrets = unique(protectedSecretValues).filter(
    (secret) => secret.length >= 4,
  );

  const replaceSecrets = (value: string): string =>
    secrets.reduce(
      (current, secret) => current.split(secret).join(redacted),
      value,
    );

  const transformPath = (value: string, forceProtected = false): string => {
    const withoutSecrets = replaceSecrets(value);
    if (forceProtected) return omittedProtectedPath;
    const expanded = withoutSecrets.startsWith("~")
      ? withoutSecrets
      : resolve(withoutSecrets);
    if (!isAbsolute(withoutSecrets)) return withoutSecrets;
    if (protectedRoots.some((root) => isInside(root, expanded)))
      return omittedProtectedPath;
    if (
      canonicalWorktreeRoot !== undefined &&
      isInside(canonicalWorktreeRoot, expanded)
    )
      return displayWorktreePath(canonicalWorktreeRoot, expanded);
    return withoutSecrets;
  };

  const sanitizeText = (value: string): string =>
    replaceSecrets(value).replace(absolutePathPattern, (match) =>
      transformPath(match),
    );

  const sanitizeJsonValue = (
    value: unknown,
    key: string,
  ): AgentToolJsonValue | undefined => {
    if (sensitiveKey.test(key)) return redacted;
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number")
      return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string")
      return pathKey.test(key)
        ? transformPath(value, key === "fullOutputPath")
        : sanitizeText(value);
    if (Array.isArray(value))
      return value.flatMap((entry) => {
        const sanitized = sanitizeJsonValue(entry, key);
        return sanitized === undefined ? [] : [sanitized];
      });
    if (typeof value === "object" && value !== null) {
      const object: Record<string, AgentToolJsonValue> = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        const sanitized = sanitizeJsonValue(childValue, childKey);
        if (sanitized !== undefined) object[childKey] = sanitized;
      }
      return object;
    }
    return undefined;
  };

  const sanitizeJsonObject = (
    value: unknown,
  ): AgentToolJsonObject | undefined => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return undefined;
    return sanitizeJsonValue(value, "") as AgentToolJsonObject;
  };

  const unsupportedContent = (label: string): AgentToolDisplayContent[] => [
    { type: "unsupported", label },
  ];

  const safeContentTypeLabel = (value: unknown): string => {
    if (typeof value !== "string") return "unknown";
    const sanitized = replaceSecrets(value);
    return safeTypeLabelPattern.test(sanitized) ? sanitized : "unknown";
  };

  const normalizeImageMimeType = (
    value: string,
  ): AgentToolImageMimeType | undefined => {
    const normalized =
      value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
    return supportedImageMimeTypes.has(normalized as AgentToolImageMimeType)
      ? (normalized as AgentToolImageMimeType)
      : undefined;
  };

  const sanitizeContent = (
    value: unknown,
  ): readonly AgentToolDisplayContent[] => {
    const record =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
    const content = Array.isArray(record?.content)
      ? record.content
      : typeof value === "string"
        ? [{ type: "text", text: value }]
        : [];
    return content.flatMap((part): AgentToolDisplayContent[] => {
      if (typeof part !== "object" || part === null)
        return unsupportedContent(
          "Unsupported tool result content type: unknown.",
        );
      const current = part as Record<string, unknown>;
      if (current.type === "text" && typeof current.text === "string")
        return [{ type: "text", text: sanitizeText(current.text) }];
      if (current.type === "image") {
        const mimeType =
          typeof current.mimeType === "string"
            ? normalizeImageMimeType(current.mimeType)
            : undefined;
        const originalMimeType = safeContentTypeLabel(current.mimeType);
        if (mimeType === undefined)
          return unsupportedContent(
            `Unsupported image result (${originalMimeType}).`,
          );
        if (
          typeof current.data !== "string" ||
          current.data.length === 0 ||
          !base64Pattern.test(current.data)
        )
          return unsupportedContent(`Malformed image result (${mimeType}).`);
        return [{ type: "image", data: current.data, mimeType }];
      }
      return unsupportedContent(
        `Unsupported tool result content type: ${safeContentTypeLabel(current.type)}.`,
      );
    });
  };

  const sanitizeResult = (
    value: unknown,
  ): AgentToolDisplayResult | undefined => {
    if (value === undefined) return undefined;
    const record =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
    const details = record?.details as Record<string, unknown> | undefined;
    const content = sanitizeContent(value);
    const truncated =
      details?.truncated === true ||
      typeof details?.fullOutputPath === "string" ||
      content.some(
        (part) =>
          part.type === "text" &&
          /output truncated|truncated output/iu.test(part.text),
      );
    return {
      content,
      ...(truncated ? { truncated: true } : {}),
    };
  };

  return { sanitizeJsonObject, sanitizeResult };
};
