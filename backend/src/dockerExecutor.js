const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const RUNNERS = {
  python: {
    image: "python:3.12-alpine",
    sourceName: "main.py",
    command: ["python", "/workspace/main.py"],
  },
  javascript: {
    image: "node:22-alpine",
    sourceName: "main.js",
    command: ["node", "/workspace/main.js"],
  },
  cpp: {
    image: "gcc:14-bookworm",
    sourceName: "main.cpp",
    command: ["sh", "-c", "g++ -O2 -std=c++17 /workspace/main.cpp -o /tmp/program && /tmp/program"],
    compilation: true,
  },
  java: {
    image: "eclipse-temurin:21-jdk-alpine",
    sourceName: "Main.java",
    command: ["sh", "-c", "javac /workspace/Main.java -d /tmp/classes && java -cp /tmp/classes Main"],
    compilation: true,
  },
};

const LIMITS = {
  timeoutMs: 5000,
  memory: "128m",
  cpus: "0.5",
  pids: "64",
  outputBytes: 64 * 1024,
};

const executionVolume = process.env.EXECUTION_VOLUME;
const executionRoot = process.env.EXECUTION_ROOT || os.tmpdir();

function truncateOutput(value, outputBytes) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= outputBytes) {
    return { value, truncated: false };
  }

  return {
    value: buffer.subarray(0, outputBytes).toString("utf8"),
    truncated: true,
  };
}

function classifyResult({ exitCode, timedOut, compilation, stdout, stderr, truncated }) {
  if (timedOut) {
    return "timeout";
  }

  if (truncated) {
    return "resource_limit";
  }

  if (exitCode === 0) {
    return "success";
  }

  if (compilation) {
    return "compilation_error";
  }

  if (stderr.toLowerCase().includes("memory") || stderr.toLowerCase().includes("killed")) {
    return "resource_limit";
  }

  return "runtime_error";
}

function runDocker(args, input, timeoutMs, outputBytes, containerName) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputLimitReached = false;
    const startedAt = Date.now();

    const collect = (chunk, target) => {
      const next = target + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > outputBytes) {
        outputLimitReached = true;
      }
      return next;
    };

    child.stdout.on("data", (chunk) => {
      stdout = collect(chunk, stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr = collect(chunk, stderr);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      const cleanup = spawn("docker", ["rm", "--force", containerName], {
        stdio: "ignore",
        windowsHide: true,
      });
      cleanup.unref();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const stdoutResult = truncateOutput(stdout, outputBytes);
      const stderrResult = truncateOutput(stderr, outputBytes);

      resolve({
        exitCode: exitCode ?? -1,
        signal,
        timedOut,
        stdout: stdoutResult.value,
        stderr: stderrResult.value,
        durationMs: Date.now() - startedAt,
        truncated: outputLimitReached || stdoutResult.truncated || stderrResult.truncated,
      });
    });

    child.stdin.end(input);
  });
}

function ensureImage(image) {
  return new Promise((resolve, reject) => {
    const inspect = spawn("docker", ["image", "inspect", image], {
      stdio: "ignore",
      windowsHide: true,
    });

    inspect.on("error", reject);
    inspect.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      const pull = spawn("docker", ["pull", image], {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
      let errorOutput = "";
      pull.stderr.on("data", (chunk) => {
        errorOutput += chunk.toString("utf8");
      });

      const timer = setTimeout(() => {
        pull.kill("SIGKILL");
        const error = new Error(`Docker image preparation timed out: ${image}`);
        error.code = "DOCKER_IMAGE_TIMEOUT";
        reject(error);
      }, 120_000);

      pull.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      pull.on("close", (pullExitCode) => {
        clearTimeout(timer);
        if (pullExitCode === 0) {
          resolve();
          return;
        }

        const error = new Error(errorOutput || `Could not pull Docker image: ${image}`);
        error.code = "DOCKER_IMAGE_PULL_FAILED";
        reject(error);
      });
    });
  });
}

async function executeInDocker({ language, code, limits = LIMITS }) {
  const runner = RUNNERS[language];
  if (!runner) {
    const error = new Error(`Unsupported language: ${language}`);
    error.code = "UNSUPPORTED_LANGUAGE";
    throw error;
  }

  await ensureImage(runner.image);

  await fs.mkdir(executionRoot, { recursive: true });
  const jobDirectory = await fs.mkdtemp(path.join(executionRoot, "codecollab-exec-"));
  const jobName = path.basename(jobDirectory);
  const sourcePath = path.join(jobDirectory, runner.sourceName);
  const containerName = `codecollab-${crypto.randomUUID()}`;

  try {
    await fs.chmod(jobDirectory, 0o755);
    await fs.writeFile(sourcePath, code, { encoding: "utf8", mode: 0o644 });

    const command = runner.command.map((argument) =>
      executionVolume
        ? argument.replaceAll("/workspace", `/workspace/${jobName}`)
        : argument
    );
    const dockerArgs = [
      "run",
      "--name", containerName,
      "--rm",
      "--network", "none",
      "--read-only",
      "--user", "65532:65532",
      "--memory", limits.memory,
      "--cpus", limits.cpus,
      "--pids-limit", String(limits.pids),
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges:true",
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
      "--mount",
      executionVolume
        ? `type=volume,src=${executionVolume},dst=/workspace,readonly`
        : `type=bind,src=${jobDirectory},dst=/workspace,readonly`,
      runner.image,
      ...command,
    ];

    const result = await runDocker(
      dockerArgs,
      "",
      limits.timeoutMs,
      limits.outputBytes,
      containerName
    );

    return {
      ...result,
      status: classifyResult({
        ...result,
        compilation: Boolean(runner.compilation),
      }),
    };
  } finally {
    await fs.rm(jobDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  LIMITS,
  RUNNERS,
  executeInDocker,
};
