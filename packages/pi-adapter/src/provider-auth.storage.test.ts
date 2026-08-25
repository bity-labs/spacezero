import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileCredentialStore,
  ProviderAuthStorageError,
} from "./provider-auth.storage.js";

const dirs: string[] = [];
const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacezero-pi-auth-"));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("FileCredentialStore", () => {
  it("sets, reads, lists, deletes, and persists provider credentials without listing secrets", async () => {
    const dir = await temp();
    const store = new FileCredentialStore({ directory: dir });

    await store.modify("anthropic", async () => ({
      type: "api_key",
      key: "sk-ant-secret-marker",
    }));

    await expect(store.read("anthropic")).resolves.toEqual({
      type: "api_key",
      key: "sk-ant-secret-marker",
    });
    await expect(store.list()).resolves.toEqual([
      { providerId: "anthropic", type: "api_key" },
    ]);
    expect(JSON.stringify(await store.list())).not.toContain("secret-marker");

    const sameDirStore = new FileCredentialStore({ directory: dir });
    await expect(sameDirStore.read("anthropic")).resolves.toEqual({
      type: "api_key",
      key: "sk-ant-secret-marker",
    });

    await sameDirStore.delete("anthropic");
    await expect(store.read("anthropic")).resolves.toBeUndefined();
  });

  it("creates restrictive directory and file permissions where supported", async () => {
    const dir = await temp();
    const authDir = join(dir, "credentials");
    const store = new FileCredentialStore({ directory: authDir });
    await store.modify("anthropic", async () => ({
      type: "api_key",
      key: "sk",
    }));

    const directoryMode = (await stat(authDir)).mode & 0o777;
    const fileMode = (await stat(join(authDir, "anthropic.json"))).mode & 0o777;
    expect(directoryMode & 0o077).toBe(0);
    expect(fileMode & 0o077).toBe(0);
  });

  it("serializes same-provider modify calls", async () => {
    const store = new FileCredentialStore({ directory: await temp() });
    let firstCanFinish!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      firstCanFinish = resolve;
    });

    const first = store.modify("anthropic", async () => {
      await firstFinished;
      return { type: "api_key", key: "first" };
    });
    const second = store.modify("anthropic", async (current) => ({
      type: "api_key",
      key: `${current?.type === "api_key" ? current.key : "missing"}-second`,
    }));

    firstCanFinish();
    await Promise.all([first, second]);
    await expect(store.read("anthropic")).resolves.toEqual({
      type: "api_key",
      key: "first-second",
    });
  });

  it("repairs permissive existing roots and credential files", async () => {
    const dir = await temp();
    const authDir = join(dir, "credentials");
    const credentialFile = join(authDir, "anthropic.json");
    await mkdir(authDir, { recursive: true });
    await writeFile(
      credentialFile,
      JSON.stringify({ type: "api_key", key: "sk" }),
      { mode: 0o644 },
    );
    await chmod(authDir, 0o755);
    const store = new FileCredentialStore({ directory: authDir });

    await expect(store.read("anthropic")).resolves.toEqual({
      type: "api_key",
      key: "sk",
    });

    expect((await stat(authDir)).mode & 0o077).toBe(0);
    expect((await stat(credentialFile)).mode & 0o077).toBe(0);
  });

  it("rejects symlinked credential roots", async () => {
    const dir = await temp();
    const target = join(dir, "target");
    await mkdir(target, { recursive: true });
    const link = join(dir, "linked-credentials");
    await symlink(target, link);
    const store = new FileCredentialStore({ directory: link });

    await expect(
      store.modify("anthropic", async () => ({ type: "api_key", key: "sk" })),
    ).rejects.toMatchObject({ code: "storage_unavailable" });
    await writeFile(join(target, "anthropic.json"), "keep me", {
      mode: 0o600,
    });
    await expect(store.delete("anthropic")).rejects.toMatchObject({
      code: "storage_unavailable",
    });
    await expect(
      readFile(join(target, "anthropic.json"), "utf8"),
    ).resolves.toBe("keep me");
  });

  it("rejects invalid provider ids, oversized keys, and corrupt credential files", async () => {
    const dir = await temp();
    const store = new FileCredentialStore({ directory: dir });

    await expect(
      store.modify("../anthropic", async () => ({
        type: "api_key",
        key: "sk",
      })),
    ).rejects.toMatchObject({ code: "invalid_provider" });
    await expect(
      store.modify("anthropic", async () => ({
        type: "api_key",
        key: "x".repeat(20_000),
      })),
    ).rejects.toMatchObject({ code: "invalid_credential" });

    await writeFile(join(dir, "anthropic.json"), "not json", { mode: 0o600 });
    await expect(store.read("anthropic")).rejects.toBeInstanceOf(
      ProviderAuthStorageError,
    );
    await expect(
      readFile(join(dir, "anthropic.json"), "utf8"),
    ).resolves.not.toContain("x".repeat(20_000));
  });
});
