import * as vscode from "vscode";
import { spawn, exec, ChildProcess } from "child_process";
import * as http from "http";
import * as net from "net";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HEALTH_TIMEOUT_MS = 3000;
const STARTUP_TIMEOUT_MS = 10000;
const HEALTH_RETRY_INTERVAL_MS = 300;
const isWindows = process.platform === "win32";

function homeDir(): string {
  return os.homedir();
}

function patchedRuntimeCandidates(): string[] {
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir(), "AppData", "Local");
    return [
      path.join(localAppData, "CodeWhale-cblage", "codewhale-tui.exe"),
      path.join(homeDir(), ".local", "lib", "codewhale-cblage", "codewhale-tui.exe"),
    ];
  }
  return [
    path.join(homeDir(), ".local", "lib", "codewhale-cblage", "codewhale-tui"),
    path.join(homeDir(), ".local", "bin", "codewhale-tui-cblage"),
  ];
}

function isPatchedRuntimePath(enginePath: string): boolean {
  const normalized = enginePath.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/codewhale-cblage/")
    || normalized.endsWith("/codewhale-tui-cblage")
    || normalized.endsWith("/codewhale-tui-cblage.exe");
}

function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { timeout: 5000, windowsHide: true },
        (err, stdout) => {
          if (err || !stdout) { resolve(); return; }
          const lines = stdout.trim().split(/\r?\n/);
          const pids = new Set<string>();
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid)) pids.add(pid);
          }
          if (pids.size === 0) { resolve(); return; }
          const pidList = Array.from(pids).join(",");
          exec(`taskkill /PID ${pidList} /T /F`, { timeout: 5000, windowsHide: true }, () => resolve());
        },
      );
    } else {
      exec(
        `lsof -ti:${port} | xargs kill -9 2>/dev/null`,
        { timeout: 3000 },
        () => resolve(),
      );
    }
  });
}

function resolveEnginePath(configuredPath: string): string {
  if (configuredPath !== "codewhale") {
    return configuredPath;
  }

  // This personal fork can use a separately installed runtime with the small
  // agent-cancellation API patch. Keep it ahead of the user's official
  // CodeWhale installation so both versions can coexist without replacing one
  // another.
  const candidates: string[] = patchedRuntimeCandidates();

  if (isWindows) {
    const appData = process.env.APPDATA || path.join(homeDir(), "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir(), "AppData", "Local");
    candidates.push(
      path.join(appData, "npm", "node_modules", "codewhale", "bin", "downloads", "codewhale.exe"),
      path.join(appData, "npm", "node_modules", "codewhale", "bin", "downloads", "codewhale.cmd"),
      path.join(localAppData, "Yarn", "Data", "global", "node_modules", "codewhale", "bin", "downloads", "codewhale.exe"),
      path.join(homeDir(), "AppData", "Roaming", "nvm", "v" + process.version.slice(1), "node_modules", "codewhale", "bin", "downloads", "codewhale.exe"),
    );
  } else {
    candidates.push(
      path.join(homeDir(), ".cargo", "bin", "codewhale"),
      path.join(homeDir(), ".cargo", "bin", "codewhale-tui"),
      "/opt/homebrew/lib/node_modules/codewhale/bin/downloads/codewhale",
      "/usr/local/lib/node_modules/codewhale/bin/downloads/codewhale",
      path.join(homeDir(), ".npm-global/lib/node_modules/codewhale/bin/downloads/codewhale"),
      path.join(homeDir(), ".local/share/codewhale/bin/downloads/codewhale"),
      "/home/linuxbrew/.linuxbrew/lib/node_modules/codewhale/bin/downloads/codewhale",
    );
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch { /* skip */ }
  }
  return isWindows ? "codewhale.exe" : "codewhale";
}

/** Find a free TCP port by binding to port 0 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export class CodeWhaleEngine {
  private process: ChildProcess | null = null;
  private _port: number = 7878;
  private _host: string = "127.0.0.1";
  private _running = false;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private outputChannel: vscode.OutputChannel,
    private context: vscode.ExtensionContext
  ) {}

  get port(): number {
    return this._port;
  }

  get host(): string {
    return this._host;
  }

  get baseUrl(): string {
    return `http://${this._host}:${this._port}`;
  }

  get token(): string | null {
    return null;
  }

  get isRunning(): boolean {
    return this._running;
  }

  private _starting: Promise<void> | null = null;
  private _workspaceKey: string = "";

  private getWorkspaceKey(): string {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return "global";
    const hash = ws.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32);
    return `ws_${hash}`;
  }

  private getPortFile(): string {
    const key = this.getWorkspaceKey();
    return path.join(this.context.globalStorageUri.fsPath, `serve.${key}.port`);
  }

  private getLegacyPortFile(): string {
    return path.join(this.context.globalStorageUri.fsPath, "serve.port");
  }

  async ensureRunning(): Promise<void> {
    // A healthy runtime adopted from the persisted port intentionally has no
    // child-process handle. Treat the established workspace binding as live;
    // re-probing it for every API action can mistake temporary load for death
    // and spawn a second runtime against the same store.
    if (this._running && this._workspaceKey === this.getWorkspaceKey()) {
      return;
    }
    if (this._starting) {
      return this._starting;
    }
    this._starting = this._doEnsureRunning();
    try {
      await this._starting;
    } finally {
      this._starting = null;
    }
  }

  private async _doEnsureRunning(): Promise<void> {
    const currentKey = this.getWorkspaceKey();
    if (this._running && this._workspaceKey === currentKey) {
      return;
    }

    const portFile = this.getPortFile();
    const legacyPortFile = this.getLegacyPortFile();

    const savedPort = this.tryReadPort(portFile) ?? this.tryReadPort(legacyPortFile);
    if (savedPort !== null) {
      this._port = savedPort;
      this.log(`Found saved port ${this._port}, checking health...`);
      if (await this.checkHealth()) {
        // A healthy detached runtime can own in-memory master/subagent work.
        // Optional route availability must never be used as permission to
        // replace it during ordinary activation. Capability probing later
        // disables unsupported controls until an explicit engine restart.
        this._running = true;
        this._workspaceKey = currentKey;
        this.log(`Reusing existing engine on port ${this._port}`);
        return;
      } else {
        this.log(`Saved port ${this._port} not responding, starting new instance`);
      }
    }

    await this.start();
    this.persistCurrentPort(currentKey, portFile);
  }

  private persistCurrentPort(
    workspaceKey = this.getWorkspaceKey(),
    portFile = this.getPortFile(),
  ): void {
    try {
      fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
      fs.writeFileSync(portFile, String(this._port));
      this._workspaceKey = workspaceKey;
    } catch { /* ignore */ }
  }

  private tryReadPort(file: string): number | null {
    try {
      const port = parseInt(fs.readFileSync(file, "utf8").trim(), 10);
      if (port > 0 && port < 65536) {
        return port;
      }
    } catch { /* no file or invalid */ }
    return null;
  }

  async start(): Promise<void> {
    await this.stop();

    // 1. Pick a random free port so we never conflict with old serve instances
    this._port = await findFreePort();
    this.log(`Selected free port: ${this._port}`);

    // 2. Use a dedicated tasks directory under the extension's storage
    const tasksDir = path.join(this.context.globalStorageUri.fsPath, "tasks");
    this.log(`Tasks dir: ${tasksDir}`);

    // 3. Start fresh engine
    const cfg = vscode.workspace.getConfiguration("cblage.codewhale");
    const configuredPath = cfg.get<string>("enginePath", "codewhale");
    const enginePath = resolveEnginePath(configuredPath);
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const baseArgs: string[] = [];
    if (workspacePath) {
      baseArgs.push("--workspace", workspacePath);
    }
    baseArgs.push(
      "serve",
      "--http",
      "--host",
      this._host,
      "--port",
      String(this._port),
      "--insecure"
    );

    this.log(
      `Starting: ${enginePath} ${baseArgs.join(" ")}`
    );
    this.log(`With DEEPSEEK_TASKS_DIR=${tasksDir}`);

    const extraPaths = isWindows
      ? [
          path.join(process.env.APPDATA || path.join(homeDir(), "AppData", "Roaming"), "npm"),
        ]
      : ["/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"];

    const pathSep = isWindows ? ";" : ":";
    const pathKey = isWindows ? "Path" : "PATH";
    const existingPath = process.env.PATH || process.env.Path || "";
    const extendedEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      DEEPSEEK_TASKS_DIR: tasksDir,
      [pathKey]: [
        ...existingPath.split(pathSep),
        ...extraPaths.filter((p) => !existingPath.split(pathSep).includes(p)),
      ].join(pathSep),
    };
    if (isWindows && pathKey === "Path" && process.env.PATH) {
      delete extendedEnv.PATH;
    }
    if (!isWindows && process.env.Path) {
      delete extendedEnv.Path;
    }

    // The engine is deliberately detached and can be reused by a new
    // extension host after a reload.  Do not leave stdout/stderr attached to
    // pipes owned by the current extension host: once that host exits, the
    // next engine write can hit a closed pipe and terminate the runtime.
    // A directly inherited append-only file descriptor survives the parent
    // host and keeps the engine's diagnostics available.
    let processLogFd: number | null = null;
    const processLogPath = path.join(
      this.context.globalStorageUri.fsPath,
      "engine-process.log"
    );
    try {
      fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
      processLogFd = fs.openSync(processLogPath, "a");
      this.log(`Process output: ${processLogPath}`);
    } catch (err) {
      this.log(
        `Unable to open persistent process log; engine output will be discarded: ${(err as Error).message}`
      );
    }

    const spawnOptions: import("child_process").SpawnOptions = {
      stdio: [
        "ignore",
        processLogFd ?? "ignore",
        processLogFd ?? "ignore",
      ],
      env: extendedEnv,
      windowsHide: true,
    };
    if (!isWindows) {
      spawnOptions.detached = true;
    }

    try {
      this.process = spawn(enginePath, baseArgs, spawnOptions);
    } finally {
      // spawn() duplicates inherited descriptors into the child before it
      // returns, so the extension host should release its copy immediately.
      if (processLogFd !== null) {
        try {
          fs.closeSync(processLogFd);
        } catch { /* already closed */ }
      }
    }

    let spawnError: string | null = null;
    let exited = false;

    this.process.on("exit", (code, signal) => {
      this.log(`Engine exited (code=${code}, signal=${signal})`);
      this._running = false;
      this.process = null;
      exited = true;
    });

    this.process.on("error", (err) => {
      this.log(`Engine error: ${err.message}`);
      this._running = false;
      this.process = null;
      spawnError = err.message;
    });

    if (!isWindows) {
      this.process.unref?.();
    }

    await this.waitForHealth();

    if (spawnError) {
      throw new Error(`Failed to start engine: ${spawnError}. Is 'codewhale' installed and in PATH?`);
    }

    if (exited || !this.process) {
      throw new Error("Engine process exited immediately. Is 'codewhale' installed and in PATH?");
    }

    if (isPatchedRuntimePath(enginePath) && !await this.checkAgentCancellationSupport()) {
      await this.stop();
      throw new Error(
        `Patched CodeWhale runtime at '${enginePath}' does not expose direct agent cancellation. Rebuild the cblage runtime before restarting the extension.`
      );
    }

    this._running = true;
    this.log(`Engine ready on port ${this._port}`);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.log("Stopping engine...");
      try {
        if (isWindows) {
          spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          this.process.kill("SIGTERM");
        }
      } catch { /* already dead */ }
      this.process = null;
      this._running = false;
    }
    try {
      const portFile = path.join(this.context.globalStorageUri.fsPath, "serve.port");
      fs.unlinkSync(portFile);
    } catch { /* ignore */ }
  }

  async restart(): Promise<void> {
    // Restart Engine is the explicit force-reset path. Unlike ordinary
    // activation, it intentionally replaces a healthy detached runtime too.
    const previousPort = this._running
      ? this._port
      : this.tryReadPort(this.getPortFile()) ?? this.tryReadPort(this.getLegacyPortFile());
    await this.stop();
    if (previousPort !== null && previousPort > 0) {
      this.log(`Force-stopping the previous engine on port ${previousPort}...`);
      await killProcessOnPort(previousPort);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await this.start();
    this.persistCurrentPort();
  }

  private async checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `${this.baseUrl}/health`,
        { timeout: HEALTH_TIMEOUT_MS },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body).status === "ok");
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Probe the POST-only cancellation route with GET. Axum returns 405 when the
   * route exists and 404 on stock runtimes, so this is side-effect free.
   */
  private async checkAgentCancellationSupport(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `${this.baseUrl}/v1/threads/__probe__/agent-runs/__probe__/cancel`,
        { timeout: HEALTH_TIMEOUT_MS },
        (res) => {
          res.resume();
          resolve(res.statusCode !== 404);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private waitForHealth(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      const tryCheck = () => {
        if (Date.now() > deadline) {
          reject(new Error("Engine failed to start within timeout"));
          return;
        }
        this.checkHealth().then((ok) => {
          if (ok) resolve();
          else setTimeout(tryCheck, HEALTH_RETRY_INTERVAL_MS);
        });
      };
      tryCheck();
    });
  }

  private log(msg: string): void {
    const line = `[CodeWhale Engine] ${msg}`;
    this.outputChannel.appendLine(line);
    try {
      const logFile = path.join(this.context.globalStorageUri.fsPath, "engine.log");
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    } catch { /* ignore */ }
  }

  dispose(): void {
    for (const d of this._disposables) d.dispose();
  }
}
