import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as http from "http";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";

const HEALTH_TIMEOUT_MS = 3000;
const STARTUP_TIMEOUT_MS = 10000;
const HEALTH_RETRY_INTERVAL_MS = 300;

function resolveEnginePath(configuredPath: string): string {
  if (configuredPath !== "deepseek") {
    return configuredPath;
  }
  const candidates = [
    "/opt/homebrew/lib/node_modules/deepseek-tui/bin/downloads/deepseek",
    "/usr/local/lib/node_modules/deepseek-tui/bin/downloads/deepseek",
    path.join(process.env.HOME || "", ".npm-global/lib/node_modules/deepseek-tui/bin/downloads/deepseek"),
    path.join(process.env.HOME || "", ".local/share/deepseek-tui/bin/downloads/deepseek"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch { /* skip */ }
  }
  return "deepseek";
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

export class DeepSeekEngine {
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

  async ensureRunning(): Promise<void> {
    if (this._running && this.process) {
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
    if (this._running && this.process) {
      return;
    }

    const portFile = path.join(this.context.globalStorageUri.fsPath, "serve.port");
    try {
      const savedPort = parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
      if (savedPort > 0 && savedPort < 65536) {
        this._port = savedPort;
        this.log(`Found saved port ${this._port}, checking health...`);
        if (await this.checkHealth()) {
          this._running = true;
          this.log(`Reusing existing engine on port ${this._port}`);
          return;
        }
        this.log(`Saved port ${this._port} not responding, starting new instance`);
      }
    } catch { /* no port file */ }

    await this.start();

    try {
      fs.mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
      fs.writeFileSync(portFile, String(this._port));
    } catch { /* ignore */ }
  }

  async start(): Promise<void> {
    await this.stop();

    const portFile = path.join(this.context.globalStorageUri.fsPath, "serve.port");
    try {
      const savedPort = parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
      if (savedPort > 0) {
        this.log(`Killing any orphan process on port ${savedPort}...`);
        const { exec } = require("child_process");
        await new Promise<void>((resolve) => {
          exec(`lsof -ti:${savedPort} | xargs kill -9 2>/dev/null`, { timeout: 3000 }, () => resolve());
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch { /* no port file */ }

    // 1. Pick a random free port so we never conflict with old serve instances
    this._port = await findFreePort();
    this.log(`Selected free port: ${this._port}`);

    // 2. Use a dedicated tasks directory under the extension's storage
    const tasksDir = this.context.globalStorageUri.fsPath + "/tasks";
    this.log(`Tasks dir: ${tasksDir}`);

    // 3. Start fresh engine
    const cfg = vscode.workspace.getConfiguration("deepseek");
    const configuredPath = cfg.get<string>("enginePath", "deepseek");
    const enginePath = resolveEnginePath(configuredPath);

    this.log(
      `Starting: ${enginePath} serve --http --host ${this._host} --port ${this._port} --insecure`
    );
    this.log(`With DEEPSEEK_TASKS_DIR=${tasksDir}`);

    const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"];
    const extendedEnv = {
      ...process.env,
      DEEPSEEK_TASKS_DIR: tasksDir,
      PATH: [
        ...(process.env.PATH || "").split(":"),
        ...extraPaths.filter((p) => !((process.env.PATH || "").includes(p))),
      ].join(":"),
    };

    this.process = spawn(enginePath, [
      "serve",
      "--http",
      "--host",
      this._host,
      "--port",
      String(this._port),
      "--insecure",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: extendedEnv,
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.log(`[stdout] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.log(`[stderr] ${data.toString().trim()}`);
    });

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

    this.process.unref?.();

    await this.waitForHealth();

    if (spawnError) {
      throw new Error(`Failed to start engine: ${spawnError}. Is 'deepseek' installed and in PATH?`);
    }

    if (exited || !this.process) {
      throw new Error("Engine process exited immediately. Is 'deepseek' installed and in PATH?");
    }

    this._running = true;
    this.log(`Engine ready on port ${this._port}`);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.log("Stopping engine...");
      try { this.process.kill("SIGTERM"); } catch { /* already dead */ }
      this.process = null;
      this._running = false;
    }
    try {
      const portFile = path.join(this.context.globalStorageUri.fsPath, "serve.port");
      fs.unlinkSync(portFile);
    } catch { /* ignore */ }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
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
    const line = `[DeepSeek Engine] ${msg}`;
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
