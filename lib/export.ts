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
const exec = promisify(execFile);
export async function exportSite(
  lovable: Lovable,
  projectId: string,
  siteId: string,
  name: string,
) {
  const dir = await mkdtemp(join(tmpdir(), "sidewalk-"));
  try {
    const listed = await lovable.call("list_files", {
      project_id: projectId,
      ref: "HEAD",
    });
    if (listed.truncated || listed.has_more || listed.next_cursor)
      throw new Error("Incomplete/paginated Lovable source listing");
    const files = listed.files;
    if (!Array.isArray(files) || !files.length)
      throw new Error("No complete file list returned");
    const paths: string[] = [];
    for (const file of files) {
      if (typeof file !== "string" && (file.binary || file.is_binary))
        throw new Error("Binary source file cannot be exported faithfully");
      const path = safePath(
        typeof file === "string" ? file : String(file.path),
      );
      if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(path))
        throw new Error(`Binary asset cannot be exported: ${path}`);
      if (
        !/\.(tsx?|jsx?|json|html|css|svg|md|txt|ya?ml|mjs|cjs)$/.test(path) &&
        ![".gitignore"].includes(path)
      )
        throw new Error(`Unsupported export file: ${path}`);
      const result = await lovable.call("read_file", {
        project_id: projectId,
        ref: "HEAD",
        path,
      });
      if (
        typeof result.content !== "string" ||
        result.truncated ||
        (result.encoding &&
          !["utf-8", "utf8", "text"].includes(String(result.encoding))) ||
        (typeof result.content === "string" && result.content.includes("\0"))
      )
        throw new Error(`Incomplete source file: ${path}`);
      if (
        /(?:sk-proj-|sb_secret_|-----BEGIN.*PRIVATE KEY)/.test(result.content)
      )
        throw new Error("Secret detected in export");
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), result.content);
      paths.push(path);
    }
    if (
      !paths.includes("package.json") ||
      !paths.includes("index.html") ||
      !paths.some((p) => /^src\/.*\.[jt]sx?$/.test(p))
    )
      throw new Error("Incomplete React/Vite codebase");
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    if (!pkg.scripts?.build) throw new Error("Missing build command");
    // Generated code is untrusted. Docker contains lifecycle scripts, without host secrets or sockets.
    const { stdout, stderr } = await exec(
      "docker",
      [
        "run",
        "--rm",
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
    await writeFile(
      join(dir, "README.md"),
      `# ${name} website\n\nUnofficial concept, not affiliated with this business.\n\nRequires Node.js 22+. Run npm install, npm run dev for local preview, and npm run build for production. Run npm run preview if available to inspect the build. Deploy the generated dist directory to any static host. No backend, account handoff, hosting service or domain transfer is included. Verify business information and image licenses before publishing. Retain noindex and the unofficial notice until the business accepts the concept.\n`,
    );
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
