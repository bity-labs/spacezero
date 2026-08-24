import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

const MAX_PROVIDER_ID_BYTES = 128;
const MAX_API_KEY_BYTES = 16 * 1024;
const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;

export class ProviderAuthStorageError extends Error {
  constructor(
    readonly code:
      "invalid_provider" | "invalid_credential" | "storage_unavailable",
  ) {
    super(code);
  }
}

export const isValidProviderId = (providerId: string): boolean =>
  providerId.length > 0 &&
  Buffer.byteLength(providerId, "utf8") <= MAX_PROVIDER_ID_BYTES &&
  /^[a-z0-9][a-z0-9._-]*$/.test(providerId) &&
  providerId === basename(providerId);

const assertProviderId = (providerId: string): void => {
  if (!isValidProviderId(providerId))
    throw new ProviderAuthStorageError("invalid_provider");
};

const assertCredential = (credential: Credential): Credential => {
  if (credential.type === "api_key") {
    if (
      credential.key !== undefined &&
      (typeof credential.key !== "string" ||
        credential.key.length === 0 ||
        Buffer.byteLength(credential.key, "utf8") > MAX_API_KEY_BYTES)
    ) {
      throw new ProviderAuthStorageError("invalid_credential");
    }
    return credential;
  }
  if (
    credential.type === "oauth" &&
    typeof credential.refresh === "string" &&
    credential.refresh.length > 0 &&
    typeof credential.access === "string" &&
    credential.access.length > 0 &&
    typeof credential.expires === "number" &&
    Number.isFinite(credential.expires)
  ) {
    return credential;
  }
  throw new ProviderAuthStorageError("invalid_credential");
};

const parseCredential = (value: unknown): Credential => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProviderAuthStorageError("invalid_credential");
  const record = value as Record<string, unknown>;
  if (record.type === "api_key") {
    return assertCredential({
      type: "api_key",
      ...(typeof record.key === "string" ? { key: record.key } : {}),
      ...(typeof record.env === "object" &&
      record.env !== null &&
      !Array.isArray(record.env)
        ? { env: record.env as Record<string, string> }
        : {}),
    });
  }
  if (record.type === "oauth") {
    return assertCredential(record as unknown as Credential);
  }
  throw new ProviderAuthStorageError("invalid_credential");
};

const operationSignal = (
  options?: AuthOperationOptions,
): AbortSignal | undefined => options?.signal;

export interface FileCredentialStoreOptions {
  readonly directory: string;
}

export class FileCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(private readonly options: FileCredentialStoreOptions) {}

  private file(providerId: string): string {
    assertProviderId(providerId);
    return join(this.options.directory, `${providerId}.json`);
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const entry = await lstat(this.options.directory);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new ProviderAuthStorageError("storage_unavailable");
    if (typeof process.getuid === "function" && entry.uid !== process.getuid())
      throw new ProviderAuthStorageError("storage_unavailable");
    if ((entry.mode & 0o077) !== 0) await chmod(this.options.directory, 0o700);
  }

  private async ensureSafeFile(file: string): Promise<void> {
    const entry = await lstat(file);
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.size > MAX_CREDENTIAL_FILE_BYTES
    )
      throw new ProviderAuthStorageError("storage_unavailable");
    if (typeof process.getuid === "function" && entry.uid !== process.getuid())
      throw new ProviderAuthStorageError("storage_unavailable");
    if ((entry.mode & 0o077) !== 0) await chmod(file, 0o600);
  }

  private enqueue<A>(
    providerId: string,
    task: () => Promise<A>,
    options?: AuthOperationOptions,
  ): Promise<A> {
    try {
      assertProviderId(providerId);
    } catch (error) {
      return Promise.reject(error);
    }
    const signal = operationSignal(options);
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const current = (async () => {
      await previous.catch(() => undefined);
      signal?.throwIfAborted();
      return task();
    })();
    const tail = current.catch(() => undefined);
    this.chains.set(providerId, tail);
    void tail.then(() => {
      if (this.chains.get(providerId) === tail) this.chains.delete(providerId);
    });
    return current;
  }

  async read(
    providerId: string,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    assertProviderId(providerId);
    operationSignal(options)?.throwIfAborted();
    const file = this.file(providerId);
    try {
      await this.ensureDirectory();
      await this.ensureSafeFile(file);
      const text = await readFile(file, "utf8");
      operationSignal(options)?.throwIfAborted();
      return parseCredential(JSON.parse(text) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if (error instanceof ProviderAuthStorageError) throw error;
      throw new ProviderAuthStorageError("storage_unavailable");
    }
  }

  async list(
    options?: AuthOperationOptions,
  ): Promise<readonly CredentialInfo[]> {
    operationSignal(options)?.throwIfAborted();
    await this.ensureDirectory();
    const infos: CredentialInfo[] = [];
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(this.options.directory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const providerId = entry.name.slice(0, -".json".length);
      if (!isValidProviderId(providerId)) continue;
      const credential = await this.read(providerId, options);
      if (credential) infos.push({ providerId, type: credential.type });
    }
    return infos.sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.enqueue(
      providerId,
      async () => {
        await this.ensureDirectory();
        const current = await this.read(providerId, options);
        const next = await fn(current);
        operationSignal(options)?.throwIfAborted();
        if (next === undefined) return current;
        const credential = assertCredential(next);
        const file = this.file(providerId);
        const tmp = join(
          this.options.directory,
          `.${providerId}.${randomUUID()}.tmp`,
        );
        await writeFile(tmp, `${JSON.stringify(credential)}\n`, {
          mode: 0o600,
        });
        await chmod(tmp, 0o600);
        await rename(tmp, file);
        await chmod(file, 0o600);
        return credential;
      },
      options,
    );
  }

  delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
    return this.enqueue(
      providerId,
      async () => {
        await this.ensureDirectory();
        await rm(this.file(providerId), { force: true });
      },
      options,
    );
  }
}

export const createFileCredentialStore = (
  options: FileCredentialStoreOptions,
): CredentialStore => new FileCredentialStore(options);
