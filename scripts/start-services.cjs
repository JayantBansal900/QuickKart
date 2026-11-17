const { spawn, execSync } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

let spawnedBackend = null;
let spawnedProductService = null;
let spawnedOrderService = null;
let spawnedGateway = null;

// Project root
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Backend service directories
const MONOLITH_DIR = path.join(PROJECT_ROOT, "backend", "services", "monolith");

const PRODUCT_SERVICE_DIR = path.join(
  PROJECT_ROOT,
  "backend",
  "services",
  "product-service",
);

const ORDER_SERVICE_DIR = path.join(
  PROJECT_ROOT,
  "backend",
  "services",
  "order-service",
);

const GATEWAY_DIR = path.join(
  PROJECT_ROOT,
  "backend",
  "services",
  "api-gateway",
);

// Frontend directory
const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");

// Pure Node.js cross-platform TCP port connectivity check
function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const finalize = (success) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(success);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize(true));
    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));

    socket.connect(port, host);
  });
}

// Check Redis via Redis protocol PING -> +PONG
function checkRedisPing(host = "127.0.0.1", port = 6379, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const finalize = (success) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve(success);
      }
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      socket.write("PING\r\n");
    });

    socket.on("data", (data) => {
      if (data.toString().includes("PONG")) {
        finalize(true);
      }
    });

    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));

    socket.connect(port, host);
  });
}

// Check Spring Boot Actuator /actuator/health
function checkBackendHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8081/actuator/health", (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          resolve({
            alive: true,
            healthy: json.status === "UP",
            details: json,
          });
        } catch {
          resolve({
            alive: true,
            healthy: res.statusCode === 200,
            details: null,
          });
        }
      });
    });

    req.on("error", () =>
      resolve({
        alive: false,
        healthy: false,
        details: null,
      }),
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();

      resolve({
        alive: false,
        healthy: false,
        details: null,
      });
    });
  });
}

// Fallback check for /api/hello
function checkBackendHello(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8081/api/hello", (res) => {
      resolve(res.statusCode === 200);
    });

    req.on("error", () => resolve(false));

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Check Product Service health
function checkProductServiceHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8082/actuator/health", (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          resolve({
            alive: true,
            healthy: json.status === "UP",
            details: json,
          });
        } catch {
          resolve({
            alive: true,
            healthy: res.statusCode === 200,
            details: null,
          });
        }
      });
    });

    req.on("error", () =>
      resolve({
        alive: false,
        healthy: false,
        details: null,
      }),
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();

      resolve({
        alive: false,
        healthy: false,
        details: null,
      });
    });
  });
}

// Check Order Service health
function checkOrderServiceHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8083/actuator/health", (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          resolve({
            alive: true,
            healthy: json.status === "UP",
            details: json,
          });
        } catch {
          resolve({
            alive: true,
            healthy: res.statusCode === 200,
            details: null,
          });
        }
      });
    });

    req.on("error", () =>
      resolve({
        alive: false,
        healthy: false,
        details: null,
      }),
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();

      resolve({
        alive: false,
        healthy: false,
        details: null,
      });
    });
  });
}

// Check API Gateway health
function checkGatewayHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8080/actuator/health", (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          resolve({
            alive: true,
            healthy: json.status === "UP",
            details: json,
          });
        } catch {
          resolve({
            alive: true,
            healthy: res.statusCode === 200,
            details: null,
          });
        }
      });
    });

    req.on("error", () =>
      resolve({
        alive: false,
        healthy: false,
        details: null,
      }),
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();

      resolve({
        alive: false,
        healthy: false,
        details: null,
      });
    });
  });
}

// Check PostgreSQL
async function isPostgresRunning() {
  const portOpen = await checkTcpPort("127.0.0.1", 5432);

  if (!portOpen) {
    return false;
  }

  if (process.platform !== "win32") {
    try {
      execSync("pg_isready -h 127.0.0.1 -p 5432", {
        stdio: "ignore",
        timeout: 2000,
      });

      return true;
    } catch {
      return true;
    }
  }

  return true;
}

// Start Redis if necessary
async function ensureRedis() {
  const isRunning = await checkRedisPing("127.0.0.1", 6379);

  if (isRunning) {
    console.log("[QuickKart] Redis is already running on port 6379.");

    return true;
  }

  console.log("[QuickKart] Starting Redis server on port 6379...");

  if (process.platform === "win32") {
    try {
      execSync(
        "net start redis 2>nul || sc start redis 2>nul || redis-server --daemonize yes 2>nul",
        {
          stdio: "ignore",
        },
      );
    } catch {}
  } else {
    try {
      execSync(
        "redis-server --daemonize yes 2>/dev/null || /etc/init.d/redis-server start 2>/dev/null || service redis-server start 2>/dev/null",
        {
          stdio: "ignore",
        },
      );
    } catch {}
  }

  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (await checkRedisPing("127.0.0.1", 6379)) {
      console.log("[QuickKart] Redis is ready on port 6379.");

      return true;
    }
  }

  console.warn(
    "[QuickKart] Warning: Redis is not reachable on localhost:6379.",
  );

  return false;
}

// Start PostgreSQL if necessary
async function ensurePostgres() {
  const isRunning = await isPostgresRunning();

  if (isRunning) {
    console.log("[QuickKart] PostgreSQL is already running on port 5432.");

    return true;
  }

  console.log("[QuickKart] Starting PostgreSQL on port 5432...");

  if (process.platform === "win32") {
    try {
      execSync(
        "net start postgresql-x64-15 2>nul || net start postgresql 2>nul",
        {
          stdio: "ignore",
        },
      );
    } catch {}
  } else {
    try {
      execSync(
        "/etc/init.d/postgresql start 2>/dev/null || service postgresql start 2>/dev/null || true",
        {
          stdio: "ignore",
        },
      );
    } catch {}
  }

  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (await isPostgresRunning()) {
      console.log("[QuickKart] PostgreSQL is ready on port 5432.");

      return true;
    }
  }

  console.warn(
    "[QuickKart] Warning: PostgreSQL is not reachable on localhost:5432.",
  );

  return false;
}

// Find Java command
function findJavaCmd() {
  if (process.env.JAVA_HOME) {
    const javaBin = path.join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "java.exe" : "java",
    );

    if (fs.existsSync(javaBin)) {
      return javaBin;
    }
  }

  const linuxJdkPath = "/usr/lib/jvm/java-17-openjdk-amd64/bin/java";

  if (fs.existsSync(linuxJdkPath)) {
    return linuxJdkPath;
  }

  return "java";
}

// Start Monolith
async function ensureBackend(postgresReady, redisReady) {
  const initialHealth = await checkBackendHealth();

  if (initialHealth.alive && initialHealth.healthy) {
    console.log(
      "[QuickKart] Spring Boot backend is already running and healthy on port 8081.",
    );

    return true;
  }

  const portOpen = await checkTcpPort("127.0.0.1", 8081);

  if (portOpen) {
    if (await checkBackendHello()) {
      console.log(
        "[QuickKart] Spring Boot backend is responding on port 8081.",
      );

      return true;
    }

    console.warn("[QuickKart] Port 8081 is in use, but backend is not ready.");

    return false;
  }

  if (!postgresReady) {
    console.error(
      "[QuickKart] Cannot start Spring Boot: PostgreSQL is not available.",
    );

    return false;
  }

  const jarPath = path.join(
    MONOLITH_DIR,
    "target",
    "quickkart-backend-0.0.1-SNAPSHOT.jar",
  );

  const pomPath = path.join(MONOLITH_DIR, "pom.xml");

  if (!fs.existsSync(jarPath)) {
    console.log(
      "[QuickKart] Backend JAR not found. Building with Maven (skip tests)...",
    );

    try {
      const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";

      execSync(`${mvnCmd} package -DskipTests -f "${pomPath}"`, {
        stdio: "inherit",
        cwd: MONOLITH_DIR,
      });
    } catch (error) {
      console.error("[QuickKart] Maven build failed:", error.message);

      return false;
    }
  }

  if (!fs.existsSync(jarPath)) {
    console.error("[QuickKart] Backend JAR still not found at " + jarPath);

    return false;
  }

  const javaCmd = findJavaCmd();

  const logPath = path.join(MONOLITH_DIR, "backend.log");

  const logFd = fs.openSync(logPath, "a");

  spawnedBackend = spawn(javaCmd, ["-Xms64m", "-Xmx256m", "-jar", jarPath], {
    detached: process.platform !== "win32",
    stdio: ["ignore", logFd, logFd],
  });

  console.log(
    `[QuickKart] Backend process started (PID: ${spawnedBackend.pid}).`,
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const health = await checkBackendHealth();

    if (health.alive && health.healthy) {
      console.log("[QuickKart] Spring Boot backend is healthy and ready!");

      return true;
    }

    if (await checkBackendHello()) {
      console.log(
        "[QuickKart] Spring Boot backend is accepting requests on port 8081!",
      );

      return true;
    }
  }

  console.warn("[QuickKart] Timed out waiting for Spring Boot health check.");

  return false;
}

// Start Product Service
async function ensureProductService(postgresReady, redisReady) {
  const initialHealth = await checkProductServiceHealth();

  if (initialHealth.alive && initialHealth.healthy) {
    console.log(
      "[QuickKart] Product Service is already running and healthy on port 8082.",
    );

    return true;
  }

  const portOpen = await checkTcpPort("127.0.0.1", 8082);

  if (portOpen) {
    const health = await checkProductServiceHealth(2000);

    if (health.healthy) {
      return true;
    }

    console.warn(
      "[QuickKart] Port 8082 is in use, but Product Service is not ready.",
    );

    return false;
  }

  if (!postgresReady) {
    console.error(
      "[QuickKart] Cannot start Product Service: PostgreSQL is not available.",
    );

    return false;
  }

  const jarPath = path.join(
    PRODUCT_SERVICE_DIR,
    "target",
    "product-service-0.0.1-SNAPSHOT.jar",
  );

  const pomPath = path.join(PRODUCT_SERVICE_DIR, "pom.xml");

  if (!fs.existsSync(jarPath)) {
    console.log(
      "[QuickKart] Product Service JAR not found. Building with Maven (skip tests)...",
    );

    try {
      const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";

      execSync(`${mvnCmd} package -DskipTests -f "${pomPath}"`, {
        stdio: "inherit",
        cwd: PRODUCT_SERVICE_DIR,
      });
    } catch (error) {
      console.error(
        "[QuickKart] Product Service Maven build failed:",
        error.message,
      );

      return false;
    }
  }

  if (!fs.existsSync(jarPath)) {
    console.error(
      "[QuickKart] Product Service JAR still not found at " + jarPath,
    );

    return false;
  }

  const javaCmd = findJavaCmd();

  const logPath = path.join(PRODUCT_SERVICE_DIR, "product-service.log");

  const logFd = fs.openSync(logPath, "a");

  spawnedProductService = spawn(
    javaCmd,
    ["-Xms64m", "-Xmx256m", "-jar", jarPath],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", logFd, logFd],
    },
  );

  console.log(
    `[QuickKart] Product Service process started (PID: ${spawnedProductService.pid}).`,
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const health = await checkProductServiceHealth();

    if (health.alive && health.healthy) {
      console.log(
        "[QuickKart] Product Service is healthy and ready on port 8082!",
      );

      return true;
    }
  }

  console.warn(
    "[QuickKart] Timed out waiting for Product Service health check.",
  );

  return false;
}

// Start Order Service
async function ensureOrderService(postgresReady, redisReady) {
  const initialHealth = await checkOrderServiceHealth();

  if (initialHealth.alive && initialHealth.healthy) {
    console.log(
      "[QuickKart] Order Service is already running and healthy on port 8083.",
    );

    return true;
  }

  const portOpen = await checkTcpPort("127.0.0.1", 8083);

  if (portOpen) {
    const health = await checkOrderServiceHealth(2000);

    if (health.healthy) {
      return true;
    }

    console.warn(
      "[QuickKart] Port 8083 is in use, but Order Service is not ready.",
    );

    return false;
  }

  if (!postgresReady) {
    console.error(
      "[QuickKart] Cannot start Order Service: PostgreSQL is not available.",
    );

    return false;
  }

  const jarPath = path.join(
    ORDER_SERVICE_DIR,
    "target",
    "order-service-0.0.1-SNAPSHOT.jar",
  );

  const pomPath = path.join(ORDER_SERVICE_DIR, "pom.xml");

  if (!fs.existsSync(jarPath)) {
    console.log(
      "[QuickKart] Order Service JAR not found. Building with Maven (skip tests)...",
    );

    try {
      const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";

      execSync(`${mvnCmd} package -DskipTests -f "${pomPath}"`, {
        stdio: "inherit",
        cwd: ORDER_SERVICE_DIR,
      });
    } catch (error) {
      console.error(
        "[QuickKart] Order Service Maven build failed:",
        error.message,
      );

      return false;
    }
  }

  if (!fs.existsSync(jarPath)) {
    console.error(
      "[QuickKart] Order Service JAR still not found at " + jarPath,
    );

    return false;
  }

  const javaCmd = findJavaCmd();

  const logPath = path.join(ORDER_SERVICE_DIR, "order-service.log");

  const logFd = fs.openSync(logPath, "a");

  spawnedOrderService = spawn(
    javaCmd,
    ["-Xms64m", "-Xmx384m", "-jar", jarPath],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", logFd, logFd],
    },
  );

  console.log(
    `[QuickKart] Order Service process started (PID: ${spawnedOrderService.pid}).`,
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const health = await checkOrderServiceHealth();

    if (health.alive && health.healthy) {
      console.log(
        "[QuickKart] Order Service is healthy and ready on port 8083!",
      );

      return true;
    }
  }

  console.warn("[QuickKart] Timed out waiting for Order Service health check.");

  return false;
}

// Start API Gateway
async function ensureGateway() {
  const initialHealth = await checkGatewayHealth();

  if (initialHealth.alive && initialHealth.healthy) {
    console.log(
      "[QuickKart] API Gateway is already running and healthy on port 8080.",
    );

    return true;
  }

  const portOpen = await checkTcpPort("127.0.0.1", 8080);

  if (portOpen) {
    const health = await checkGatewayHealth(2000);

    if (health.healthy) {
      return true;
    }

    console.warn(
      "[QuickKart] Port 8080 is in use, but API Gateway is not ready.",
    );

    return false;
  }

  const jarPath = path.join(
    GATEWAY_DIR,
    "target",
    "api-gateway-0.0.1-SNAPSHOT.jar",
  );

  const pomPath = path.join(GATEWAY_DIR, "pom.xml");

  if (!fs.existsSync(jarPath)) {
    console.log(
      "[QuickKart] API Gateway JAR not found. Building with Maven (skip tests)...",
    );

    try {
      const mvnCmd = process.platform === "win32" ? "mvn.cmd" : "mvn";

      execSync(`${mvnCmd} package -DskipTests -f "${pomPath}"`, {
        stdio: "inherit",
        cwd: GATEWAY_DIR,
      });
    } catch (error) {
      console.error(
        "[QuickKart] API Gateway Maven build failed:",
        error.message,
      );

      return false;
    }
  }

  if (!fs.existsSync(jarPath)) {
    console.error("[QuickKart] API Gateway JAR still not found at " + jarPath);

    return false;
  }

  const javaCmd = findJavaCmd();

  const logPath = path.join(GATEWAY_DIR, "api-gateway.log");

  const logFd = fs.openSync(logPath, "a");

  spawnedGateway = spawn(javaCmd, ["-Xms64m", "-Xmx256m", "-jar", jarPath], {
    detached: process.platform !== "win32",
    stdio: ["ignore", logFd, logFd],
  });

  console.log(
    `[QuickKart] API Gateway process started (PID: ${spawnedGateway.pid}).`,
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const health = await checkGatewayHealth();

    if (health.alive && health.healthy) {
      console.log("[QuickKart] API Gateway is healthy and ready on port 8080!");

      return true;
    }
  }

  console.warn("[QuickKart] Timed out waiting for API Gateway health check.");

  return false;
}

// Cleanup spawned processes
function cleanup() {
  const processes = [
    ["backend", spawnedBackend],
    ["Product Service", spawnedProductService],
    ["Order Service", spawnedOrderService],
    ["API Gateway", spawnedGateway],
  ];

  for (const [name, process] of processes) {
    if (!process || process.killed) {
      continue;
    }

    console.log(`\n[QuickKart] Stopping ${name} (PID: ${process.pid})...`);

    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${process.pid} /T /F`, {
          stdio: "ignore",
        });
      } else {
        process.kill(-process.pid, "SIGTERM");
      }
    } catch {
      try {
        process.kill("SIGTERM");
      } catch {}
    }
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// Main
async function main() {
  console.log("\n==================================================");

  console.log("       Starting QuickKart Services...             ");

  console.log("==================================================\n");

  const redisReady = await ensureRedis();

  const postgresReady = await ensurePostgres();

  const backendReady = await ensureBackend(postgresReady, redisReady);

  const productServiceReady = await ensureProductService(
    postgresReady,
    redisReady,
  );

  const orderServiceReady = await ensureOrderService(postgresReady, redisReady);

  const gatewayReady = await ensureGateway();

  const health = await checkBackendHealth();

  const psHealth = await checkProductServiceHealth();

  const osHealth = await checkOrderServiceHealth();

  const gwHealth = await checkGatewayHealth();

  const dbStatus =
    health.details?.components?.db?.status || (postgresReady ? "UP" : "DOWN");

  const redisStatus =
    health.details?.components?.redis?.status || (redisReady ? "UP" : "DOWN");

  const overallStatus = health.healthy
    ? "UP"
    : backendReady
      ? "PARTIAL"
      : "DOWN";

  const psOverallStatus = psHealth.healthy
    ? "UP"
    : productServiceReady
      ? "PARTIAL"
      : "DOWN";

  const osOverallStatus = osHealth.healthy
    ? "UP"
    : orderServiceReady
      ? "PARTIAL"
      : "DOWN";

  const gwOverallStatus = gwHealth.healthy
    ? "UP"
    : gatewayReady
      ? "PARTIAL"
      : "DOWN";

  console.log("\n==================================================");

  console.log("QuickKart Development Environment Status");

  console.log("--------------------------------------------------");

  console.log(
    `PostgreSQL:      ${postgresReady ? "RUNNING (Port 5432)" : "OFFLINE"}`,
  );

  console.log(
    `Redis:           ${redisReady ? "RUNNING (Port 6379)" : "OFFLINE"}`,
  );

  console.log(
    `API Gateway:     ${
      gatewayReady ? "RUNNING on http://localhost:8080" : "OFFLINE"
    }`,
  );

  console.log(
    `Monolith:        ${
      backendReady ? "RUNNING on http://localhost:8081" : "OFFLINE"
    }`,
  );

  console.log(
    `Product Service: ${
      productServiceReady ? "RUNNING on http://localhost:8082" : "OFFLINE"
    }`,
  );

  console.log(
    `Order Service:   ${
      orderServiceReady ? "RUNNING on http://localhost:8083" : "OFFLINE"
    }`,
  );

  console.log(`Gateway Health:  ${gwOverallStatus}`);

  console.log(
    `Monolith Health: ${overallStatus} (DB: ${dbStatus}, Redis: ${redisStatus})`,
  );

  console.log(`Product Health:  ${psOverallStatus}`);

  console.log(`Order Health:    ${osOverallStatus}`);

  console.log("Frontend:        STARTING on http://localhost:3000");

  console.log("==================================================");

  // Launch Vite from the frontend directory
  const viteArgs = process.argv.slice(2);
  const finalArgs = [...viteArgs];

  if (!finalArgs.some((arg) => arg.includes("--port"))) {
    finalArgs.push("--port=3000");
  }

  if (!finalArgs.some((arg) => arg.includes("--host"))) {
    finalArgs.push("--host=0.0.0.0");
  }

  const frontendNodeModules = path.join(FRONTEND_DIR, "node_modules");

  const localVite = path.join(
    frontendNodeModules,
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );

  let viteCmd = localVite;
  let viteExecArgs = finalArgs;

  if (!fs.existsSync(localVite)) {
    viteCmd = process.platform === "win32" ? "npx.cmd" : "npx";

    viteExecArgs = ["vite", ...finalArgs];
  }

  const vite = spawn(viteCmd, viteExecArgs, {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
  });

  vite.on("exit", (code) => {
    cleanup();
    process.exit(code || 0);
  });
}

main();
