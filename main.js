import { readFile, writeFile, access } from "node:fs/promises"
import { spawn } from "child_process";
import { createHash } from 'crypto'
import path from "node:path"

const configRoot = "/config"

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileSHA256(filePath) {
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

function runCmd(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true })
    p.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}`))
    })
  })
}

function runGit(args, cwd) {
  const sshKeyPath = path.join(configRoot, "deploy_key")
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no`
    };

    const p = spawn("git", args, { cwd, env });

    p.stdout.on("data", d => process.stdout.write(d));
    p.stderr.on("data", d => process.stderr.write(d));

    p.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function cloneRepo(repoUrl, destPath, headCommit) {
  // 1. clone
  await runGit(["clone", repoUrl, destPath]);

  // 2. checkout specific commit (if provided)
  if (headCommit) {
    await runGit(["checkout", headCommit], destPath);
  }
  console.log("Clone & checkout completed!");
}

async function getGitCommitHash(repoPath) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["rev-parse", "HEAD"], { cwd: repoPath });

    let output = "";
    p.stdout.on("data", d => {
      output += d.toString();
    });
    p.stderr.on("data", d => {
      process.stderr.write(d);
    });

    p.on("close", code => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`git rev-parse exited with ${code}`));
    });
  });
}

async function uploadFile(uploadUrl, uploadToken, filePath, uploadPath) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(filePath)]), { type: "application/octet-stream" });
  const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(uploadPath)}`, {
    method: 'POST',
    header: { Authorization: `Bearer ${uploadToken}` }
    body: form,
  })
  if (!response.ok) {
    throw new Error(`File upload failed with status ${response.status}`);
  }
  const result = await response.json()
  if (!result?.data?.url) {
    throw new Error(`File upload response missing URL: ${JSON.stringify(result)}`);
  }
  return result.data.url
}

async function uploadBundle(config, bundleUrl) {
  const response = await fetch(config.bundleUploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.bundleUploadToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_name: process.env.APP_NAME || "app",
      version_code: config.versionCode || 1,
      version_name: config.versionName || "0.0.1",
      min_app_version: Number(process.env.MIN_APP_VERSION) || 1,
      max_app_version: Number(process.env.MAX_APP_VERSION) || 999999999,
      bundle_name: config.bundleName,
      commit_hash: config.HEAD || "unknown",
      bundle_sha256: config.bundleHash ?? '',  // Optional: could be calculated if needed
      download_url: bundleUrl,
      is_preset: config.preset || false
    })
  })
  if (!response.ok) {
    throw new Error(`Bundle upload failed with status ${response.status}`);
  }
  const result = await response.json()
  if (result.code !== 0) {
    throw new Error(`Bundle upload error: ${JSON.stringify(result)}`);
  }
  return result.data
}

async function main() {
  const configString = await readFile(path.join(configRoot, 'config.json'), 'utf8')
  const config = JSON.parse(configString)

  const buildCommit = process.env.BUILD_COMMIT || config.BUILD_BRANCH || undefined
  let { projectPath, repo } = config

  if (process.env.PROJECT_PATH) {
    projectPath = process.env.PROJECT_PATH
  }
  if (process.env.REPO_URL) {
    repo = process.env.REPO_URL
  }

  console.log(`Cloning repository: ${repo} at commit: ${buildCommit || "latest"}`)

  await cloneRepo(repo, "repo", buildCommit)
  console.log("Repository cloned successfully.")
  

  const repoDir = path.join(process.cwd(), "repo", projectPath)
  const packageJsonPath = path.join(repoDir, "package.json")
  const packageJSON = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const versionStr = packageJSON.version || "0.0.0"
  const versionCode = versionStr.split('.').reduce((acc, num, idx) => {
    return acc + parseInt(num) * Math.pow(1000, 2 - idx)
  }, 0)
  console.log(`Project version: ${versionStr} (code: ${versionCode})`)
  const currentCommitHash = await getGitCommitHash(repoDir)
  console.log(`Current commit hash: ${currentCommitHash}`)

  console.log("Installing dependencies...")
  await runCmd("pnpm", ["install"], repoDir)

  console.log("Building project...")
  await runCmd("pnpm", ["build"], repoDir)

  const bundlePath = path.join(process.cwd(), "repo", projectPath, config.distPath)
  const bundleSha256 = await fileSHA256(bundlePath)
  console.log(`Bundle SHA256: ${bundleSha256}`)
  const uploadResultUrl = await uploadFile(
    config.assetsUploadUrl,
    config.assetsUploadToken,
    bundlePath,
    `lynxbundles/${bundleSha256}.bundle`
  )
  console.log(`Bundle uploaded successfully: ${uploadResultUrl}`)
  const bundleResult = await uploadBundle({
    ...config,
    versionCode,
    versionName: versionStr,
    bundleName: packageJSON.bundleConfig?.bundleName || "unknown.lynx.bundle",
    preset: packageJSON.bundleConfig?.preset || false,
    HEAD: currentCommitHash,
    bundleHash: bundleSha256
  }, uploadResultUrl)
  console.log(`Bundle registered successfully: ${JSON.stringify(bundleResult)}`)
}

main()
