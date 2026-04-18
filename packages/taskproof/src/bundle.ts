import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { zipSync } from "fflate";

export async function writeEvidenceBundle(sourceDir: string, bundlePath: string): Promise<void> {
  const entries: Record<string, Uint8Array> = {};
  const normalizedBundlePath = resolve(bundlePath);
  await collectEntries(sourceDir, sourceDir, normalizedBundlePath, entries);
  await writeFile(bundlePath, zipSync(entries, { level: 6 }));
}

async function collectEntries(
  rootDir: string,
  currentDir: string,
  bundlePath: string,
  entries: Record<string, Uint8Array>
): Promise<void> {
  const dirEntries = await readdir(currentDir, { withFileTypes: true });
  const sortedEntries = [...dirEntries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    const entryPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await collectEntries(rootDir, entryPath, bundlePath, entries);
      continue;
    }

    if (resolve(entryPath) === bundlePath) {
      continue;
    }

    entries[relative(rootDir, entryPath).replaceAll("\\", "/")] = new Uint8Array(
      await readFile(entryPath)
    );
  }
}
