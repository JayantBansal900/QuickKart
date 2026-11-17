const http = require("http");

const GATEWAY_URL = "http://127.0.0.1:8080";

// Credentials come from the environment (e.g. the DEV_ADMIN_* values in your local .env);
// never hardcode an admin password in the repository.
const ADMIN_EMAIL = process.env.BENCH_ADMIN_EMAIL || process.env.DEV_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.BENCH_ADMIN_PASSWORD || process.env.DEV_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set BENCH_ADMIN_EMAIL and BENCH_ADMIN_PASSWORD (or DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD) first.");
  process.exit(1);
}

const SAMPLE_COUNT = 20;
const WARM_CACHE_SAMPLES = 15;

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const headers = {
      ...(options.headers || {}),
    };

    let requestBody = body;

    if (requestBody !== null && requestBody !== undefined) {
      if (typeof requestBody === "object") {
        requestBody = JSON.stringify(requestBody);
        headers["Content-Type"] = "application/json";
      }

      headers["Content-Length"] = Buffer.byteLength(requestBody);
    }

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers,
    };

    const start = process.hrtime.bigint();

    const req = http.request(reqOptions, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;

        let parsedBody = null;

        try {
          parsedBody = JSON.parse(data);
        } catch {
          parsedBody = data;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsedBody,
          durationMs,
        });
      });
    });

    req.on("error", reject);

    if (requestBody !== null && requestBody !== undefined) {
      req.write(requestBody);
    }

    req.end();
  });
}

function calculateStats(samples) {
  if (!samples.length) {
    throw new Error("No successful benchmark samples were collected.");
  }

  const total = samples.reduce((sum, value) => sum + value, 0);

  return {
    count: samples.length,
    average: total / samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

function printStats(label, stats) {
  console.log(
    `${label} (${stats.count} samples): ` +
      `Avg: ${formatMs(stats.average)} | ` +
      `Min: ${formatMs(stats.min)} | ` +
      `Max: ${formatMs(stats.max)}`,
  );
}

function assertStatus(response, expectedStatus, label) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} failed. Expected ${expectedStatus}, got ${response.status}.`,
    );
  }
}

async function loginAsAdmin() {
  const response = await request(
    `${GATEWAY_URL}/api/auth/login`,
    {
      method: "POST",
    },
    {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  );

  assertStatus(response, 200, "Admin login");

  const token = response.body?.token;

  if (!token) {
    throw new Error("Admin login succeeded but no JWT token was returned.");
  }

  return token;
}

async function createBenchmarkProduct(adminToken) {
  const response = await request(
    `${GATEWAY_URL}/api/admin/products`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      name: `Benchmark Item ${Date.now()}`,
      description: "Temporary product for performance benchmarking",
      price: 99.99,
      stockQuantity: 100,
      category: "Benchmark",
    },
  );

  assertStatus(response, 201, "Benchmark product creation");

  const productId = response.body?.id;

  if (!productId) {
    throw new Error(
      "Benchmark product was created but no product ID was returned.",
    );
  }

  return productId;
}

async function deleteBenchmarkProduct(adminToken, productId) {
  if (!productId) {
    return;
  }

  try {
    const response = await request(
      `${GATEWAY_URL}/api/admin/products/${productId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );

    if (response.status === 204) {
      console.log(`✓ Benchmark product ${productId} cleaned up.`);
    } else {
      console.warn(
        `⚠ Benchmark product cleanup returned status ${response.status}.`,
      );
    }
  } catch (error) {
    console.warn(`⚠ Could not clean up benchmark product: ${error.message}`);
  }
}

async function registerAndLoginCustomer() {
  const timestamp = Date.now();

  const email = `bench_cust_${timestamp}@quickkart.com`;

  const password = "Password123!";

  const registerResponse = await request(
    `${GATEWAY_URL}/api/auth/register`,
    {
      method: "POST",
    },
    {
      name: "Benchmark Customer",
      email,
      password,
    },
  );

  if (
    registerResponse.status !== 201 &&
    registerResponse.status !== 200 &&
    registerResponse.status !== 409
  ) {
    throw new Error(
      `Customer registration failed with status ${registerResponse.status}.`,
    );
  }

  const loginResponse = await request(
    `${GATEWAY_URL}/api/auth/login`,
    {
      method: "POST",
    },
    {
      email,
      password,
    },
  );

  assertStatus(loginResponse, 200, "Benchmark customer login");

  const token = loginResponse.body?.token;

  if (!token) {
    throw new Error("Customer login succeeded but no JWT token was returned.");
  }

  return token;
}

async function runBenchmark() {
  let adminToken = "";
  let benchmarkProductId = null;

  try {
    console.log("====================================================");

    console.log("       QUICKKART EMPIRICAL PERFORMANCE BENCHMARK");

    console.log("====================================================\n");

    console.log("Testing environment: Docker Compose QuickKart stack");

    console.log(`Gateway: ${GATEWAY_URL}\n`);

    // --------------------------------------------------
    // 1. Admin Login Benchmark
    // --------------------------------------------------

    console.log(">>> 1. Benchmarking POST /api/auth/login");

    const loginTimes = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const response = await request(
        `${GATEWAY_URL}/api/auth/login`,
        {
          method: "POST",
        },
        {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      );

      if (response.status === 200) {
        loginTimes.push(response.durationMs);

        adminToken = response.body?.token || adminToken;
      }
    }

    const loginStats = calculateStats(loginTimes);

    printStats("Login Results", loginStats);

    if (!adminToken) {
      throw new Error("Could not obtain an admin JWT token.");
    }

    console.log();

    // --------------------------------------------------
    // 2. Product Catalog Benchmark
    // --------------------------------------------------

    console.log(">>> 2. Benchmarking GET /api/products");

    const catalogTimes = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const response = await request(`${GATEWAY_URL}/api/products`);

      if (response.status === 200 && Array.isArray(response.body)) {
        catalogTimes.push(response.durationMs);
      }
    }

    const catalogStats = calculateStats(catalogTimes);

    printStats("Catalog Results", catalogStats);

    console.log();

    // --------------------------------------------------
    // 3. Redis Cold vs Warm Cache Benchmark
    // --------------------------------------------------

    console.log(">>> 3. Benchmarking Redis Cold vs Warm Cache");

    benchmarkProductId = await createBenchmarkProduct(adminToken);

    console.log(`Created temporary benchmark product: ${benchmarkProductId}`);

    // Cold request
    const coldResponse = await request(
      `${GATEWAY_URL}/api/products/${benchmarkProductId}`,
    );

    assertStatus(coldResponse, 200, "Cold cache product request");

    const coldLatency = coldResponse.durationMs;

    // Warm requests
    const warmTimes = [];

    for (let i = 0; i < WARM_CACHE_SAMPLES; i++) {
      const response = await request(
        `${GATEWAY_URL}/api/products/${benchmarkProductId}`,
      );

      if (response.status === 200) {
        warmTimes.push(response.durationMs);
      }
    }

    const warmStats = calculateStats(warmTimes);

    console.log(
      `Cold Request (initial DB-backed fetch): ${formatMs(coldLatency)}`,
    );

    printStats("Warm Requests (Redis cache)", warmStats);

    if (warmStats.average > 0) {
      const speedup = coldLatency / warmStats.average;

      console.log(`Observed Cache Speedup Factor: ~${speedup.toFixed(1)}x`);
    }

    console.log();

    // --------------------------------------------------
    // 4. Checkout Benchmark
    // --------------------------------------------------

    console.log(">>> 4. Benchmarking Atomic Checkout");

    const customerToken = await registerAndLoginCustomer();

    const customerHeaders = {
      Authorization: `Bearer ${customerToken}`,
    };

    // Add benchmark product to cart
    const cartResponse = await request(
      `${GATEWAY_URL}/api/cart/items`,
      {
        method: "POST",
        headers: customerHeaders,
      },
      {
        productId: benchmarkProductId,
        quantity: 1,
      },
    );

    if (cartResponse.status !== 200 && cartResponse.status !== 201) {
      throw new Error(
        `Adding benchmark product to cart failed with status ${cartResponse.status}.`,
      );
    }

    // Checkout
    const checkoutResponse = await request(
      `${GATEWAY_URL}/api/orders/checkout`,
      {
        method: "POST",
        headers: customerHeaders,
      },
      {
        paymentMethod: "CARD",
      },
    );

    if (checkoutResponse.status !== 200 && checkoutResponse.status !== 201) {
      throw new Error(
        `Checkout failed with status ${checkoutResponse.status}.`,
      );
    }

    const orderId =
      checkoutResponse.body?.id || checkoutResponse.body?.orderId || "unknown";

    console.log(`Checkout Status: ${checkoutResponse.status}`);

    console.log(`Order ID: ${orderId}`);

    console.log(`Execution Time: ${formatMs(checkoutResponse.durationMs)}`);

    console.log();

    // --------------------------------------------------
    // Final Result
    // --------------------------------------------------

    console.log("====================================================");

    console.log("       EMPIRICAL BENCHMARK PASS COMPLETE");

    console.log("====================================================");
  } finally {
    // Always attempt benchmark cleanup
    await deleteBenchmarkProduct(adminToken, benchmarkProductId);
  }
}

runBenchmark().catch((error) => {
  console.error("\n❌ BENCHMARK FAILED:", error.message);

  process.exit(1);
});
