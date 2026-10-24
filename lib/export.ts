import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { safePath, slug } from "./domain";
import { Lovable } from "./lovable";
import { db } from "./db";
import { env } from "./config";
import { z } from "zod";
const exec = promisify(execFile);
export function sourcePackage(source: { path: string; content: string }[]) {
  const file = source.find((file) => file.path === "package.json");
  if (!file || !source.some((file) => /^src\/.*\.[jt]sx?$/.test(file.path)))
    throw new Error("Incomplete React source codebase");
  const pkg = JSON.parse(file.content);
  if (!pkg.scripts?.build || !pkg.dependencies?.react)
    throw new Error("Missing React dependency or build command");
  return pkg;
}
export function deploymentReadme(name: string, pkg: Record<string, any>) {
  const deployment = pkg.dependencies?.["@tanstack/react-start"]
    ? "This is a TanStack Start application with a server build. Keep the configured Vite/Nitro deployment target and deploy the server output together with its public assets; uploading only a static dist folder is insufficient. See https://nitro.build/deploy for the configured target's deployment instructions. Run npm run preview when the project provides that script to test the production build locally."
    : "Deploy the generated dist directory to a static host. Run npm run preview if available to inspect the production build first.";
  return `# ${name} website\n\nRequires Node.js 22+. Run npm install, npm run dev for local preview, and npm run build for production. The source was built from its original lockfile in an isolated linux/amd64 Node 22 container without application secrets.\n\n${deployment}\n\nBusiness photos and source menu images use remote public URLs; they are not bundled in this source archive. Google photo URLs can expire and may need refreshing or replacement with business-supplied assets. Preserve Google Maps and author attributions with displayed reviews and photos.\n\nNo hosting service, domain transfer or account handoff is included. Verify business information, menu prices and image licenses before publishing.\n`;
}
const sourcePageSchema = z.object({
  ref: z.string(),
  data: z.array(z.object({ path: z.string(), binary: z.boolean() })).max(100),
  pagination: z.object({
    has_more: z.boolean(),
    next_cursor: z.string().nullable().optional(),
  }),
  truncated: z.boolean().optional(),
});
/** Collect a complete, immutable source tree before invoking any generated code. */
export async function readProjectSource(
  lovable: Pick<Lovable, "call">,
  projectId: string,
  ref: string,
) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(ref))
    throw new Error("Source export requires a completed build's commit SHA");
  const paths: string[] = [];
  const seenPaths = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  do {
    if (++pages > 100)
      throw new Error("Lovable source listing exceeds page limit");
    const listed = sourcePageSchema.parse(
      await lovable.call("list_files", {
        project_id: projectId,
        ref,
        limit: 100,
        cursor,
      }),
    );
    if (listed.ref !== ref || listed.truncated)
      throw new Error("Incomplete or mismatched Lovable source listing");
    for (const file of listed.data) {
      if (file.binary)
        throw new Error("Binary source file cannot be exported faithfully");
      const path = safePath(file.path);
      if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(path))
        throw new Error(`Binary asset cannot be exported: ${path}`);
      if (
        !/\.(tsx?|jsx?|jsonc?|html|css|svg|md|txt|ya?ml|mjs|cjs|toml)$/.test(
          path,
        ) &&
        ![".gitignore", ".prettierignore", ".prettierrc"].includes(path)
      )
        throw new Error(`Unsupported export file: ${path}`);
      if (seenPaths.has(path))
        throw new Error(`Duplicate source path: ${path}`);
      seenPaths.add(path);
      paths.push(path);
      if (paths.length > 1000)
        throw new Error("Lovable source listing exceeds file limit");
    }
    const next = listed.pagination.next_cursor;
    if (listed.pagination.has_more) {
      if (
        !listed.data.length ||
        typeof next !== "string" ||
        !next ||
        cursors.has(next)
      )
        throw new Error("Incomplete or repeated Lovable pagination cursor");
      cursors.add(next);
      cursor = next;
    } else {
      if (next != null)
        throw new Error("Inconsistent Lovable pagination cursor");
      cursor = undefined;
    }
  } while (cursor);
  if (!paths.length) throw new Error("No complete file list returned");
  const source: { path: string; content: string }[] = [];
  let bytes = 0;
  for (const path of paths) {
    const result = await lovable.call("read_file", {
      project_id: projectId,
      ref,
      path,
    });
    if (
      typeof result.content !== "string" ||
      result.truncated ||
      (result.encoding &&
        !["utf-8", "utf8", "text"].includes(String(result.encoding))) ||
      result.content.includes("\0")
    )
      throw new Error(`Incomplete source file: ${path}`);
    if (/(?:sk-proj-|sb_secret_|-----BEGIN.*PRIVATE KEY)/.test(result.content))
      throw new Error("Secret detected in export");
    bytes += Buffer.byteLength(result.content);
    if (bytes > 25 * 1024 * 1024)
      throw new Error("Lovable source exceeds size limit");
    source.push({ path, content: result.content });
  }
  return source;
}
export async function exportSite(
  lovable: Lovable,
  projectId: string,
  siteId: string,
  name: string,
  ref: string,
) {
  const dir = await mkdtemp(join(tmpdir(), "sidewalk-"));
  try {
    const source = await readProjectSource(lovable, projectId, ref);
    const paths = source.map((file) => file.path);
    for (const { path, content } of source) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    }
    const pkg = sourcePackage(source);
    // Generated code is untrusted. Docker contains lifecycle scripts, without host secrets or sockets.
    const { stdout, stderr } = await exec(
      "docker",
      [
        "run",
        "--rm",
        // Lovable lockfiles pin linux-x64 native bindings; match that platform on ARM hosts.
        "--platform=linux/amd64",
        "--memory=1g",
        "--cpus=2",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=256",
        "-v",
        `${dir}:/workspace`,
        "-w",
        "/workspace",
        "node:22-bookworm-slim",
        "sh",
        "-c",
        "npm install --no-audit --no-fund && npm run build",
      ],
      { timeout: 240000, maxBuffer: 4 * 1024 * 1024 },
    );
    await writeFile(join(dir, "README.md"), deploymentReadme(name, pkg));
    const zip = join(tmpdir(), `${siteId}.zip`);
    try {
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zip);
        const archive = archiver("zip", { zlib: { level: 9 } });
        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);
        for (const path of [
          ...new Set([...paths, "README.md", "package-lock.json"]),
        ])
          archive.file(join(dir, path), { name: path });
        void archive.finalize();
      });
      const buffer = await readFile(zip);
      const checksum = createHash("sha256").update(buffer).digest("hex");
      const path = `${siteId}/${slug(name)}-website.zip`;
      const { data: bucket, error: bucketError } = await db().storage.getBucket(
        env("SUPABASE_ZIP_BUCKET"),
      );
      if (bucketError) throw bucketError;
      if (bucket.public) throw new Error("Source ZIP bucket must be private");
      const { error } = await db()
        .storage.from(env("SUPABASE_ZIP_BUCKET"))
        .upload(path, buffer, {
          contentType: "application/zip",
          upsert: false,
        });
      if (error) throw error;
      return {
        zip_path: path,
        checksum,
        build_log: (stdout + stderr).slice(-12000),
      };
    } finally {
      await rm(zip, { force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
