#!/usr/bin/env node
"use strict";

/**
 * scripts/load-test.js
 * Comprehensive backend API load test targeting 500 req/s concurrency with autocannon.
 *
 * Supported endpoints:
 *   1. GET /health
 *   2. GET /api/accounts/:publicKey
 *   3. GET /api/analytics/:publicKey/summary
 *
 * Parameters (via CLI flags or environment variables):
 *   --apiUrl, API_URL: Base URL of the API (default: http://localhost:4000)
 *   --publicKey, PUBLIC_KEY: Stellar public key to test account/analytics endpoints
 *   --connections, CONNECTIONS: Concurrent connections (default: 500)
 *   --duration, DURATION: Duration in seconds (default: 30)
 *   --slo, SLO: p95 SLO latency threshold in ms (default: 500)
 *   --endpoint, ENDPOINT: Specific endpoint to test ("all", "health", "account", "analytics")
 */

const autocannon = require("autocannon");
const { decodeHist } = require("autocannon/lib/histUtil");
const { URL } = require("url");

function parseArgs(argv) {
  const result = {};
  argv.forEach((arg) => {
    const [key, value] = arg.split("=");
    if (!value) return;
    switch (key.replace(/^--/, "")) {
      case "apiUrl":
      case "api_url":
        result.apiUrl = value;
        break;
      case "publicKey":
      case "public_key":
        result.publicKey = value;
        break;
      case "connections":
        result.connections = Number(value);
        break;
      case "duration":
        result.duration = Number(value);
        break;
      case "slo":
        result.slo = Number(value);
        break;
      case "endpoint":
        result.endpoint = value;
        break;
      default:
        break;
    }
  });
  return result;
}

const args = parseArgs(process.argv.slice(2));
const apiUrl = args.apiUrl || process.env.API_URL || "http://localhost:4000";
const defaultTestPublicKey = "GBZXN7PIRZGNMHGA72BL3UMIXTCGD245NBPGGC65JBG5WDAREV6PA47";
const publicKey = args.publicKey || process.env.PUBLIC_KEY || defaultTestPublicKey;
const concurrency = Number(args.connections || process.env.CONNECTIONS || 500);
const durationSeconds = Number(args.duration || process.env.DURATION || 30);
const sloMs = Number(args.slo || process.env.SLO || 500);
const targetEndpoint = args.endpoint || process.env.ENDPOINT || "all";

function getPercentile(hist, pct) {
  if (!hist) return null;
  if (typeof hist.percentile === "function") return hist.percentile(pct);
  if (typeof hist.getValueAtPercentile === "function") return hist.getValueAtPercentile(pct);
  return null;
}

function runAutocannon(endpointConfig) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(endpointConfig.path, apiUrl).toString();
    console.log(`\n============================================================`);
    console.log(`Testing Endpoint: ${endpointConfig.name} [${fullUrl}]`);
    console.log(`Target: 500 req/s concurrency (${concurrency} connections) for ${durationSeconds}s`);
    console.log(`SLO: p95 < ${sloMs} ms`);
    console.log(`============================================================`);

    const instance = autocannon(
      {
        url: fullUrl,
        connections: concurrency,
        duration: durationSeconds,
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        skipAggregateResult: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    autocannon.track(instance, { renderProgressBar: true });
  });
}

function summarizeResult(endpointName, result) {
  const decodedLatencyHist = decodeHist(result.latencies);
  const p50 = getPercentile(decodedLatencyHist, 50) ?? result.latency?.p50 ?? 0;
  const p95 = getPercentile(decodedLatencyHist, 95) ?? result.latency?.p95 ?? 0;
  const p99 = getPercentile(decodedLatencyHist, 99) ?? result.latency?.p99 ?? 0;

  const totalRequests = result.requests?.total ?? result.totalRequests ?? 0;
  const throughputReqSec = result.requests?.average ?? (totalRequests / durationSeconds);
  const throughputBytesSec = result.throughput?.average ?? 0;

  const errors = result.errors || 0;
  const timeouts = result.timeouts || 0;
  const count2xx = result["2xx"] || 0;
  const count4xx = result["4xx"] || 0;
  const count5xx = result["5xx"] || 0;
  const count429 = result.statusCodeStats?.["429"]?.count || 0;

  const failureCount = errors + timeouts + count5xx;
  const errorRatePct = totalRequests > 0 ? (failureCount / totalRequests) * 100 : 0;

  console.log(`\n--- Results for ${endpointName} ---`);
  console.log(`  Throughput:      ${throughputReqSec.toFixed(1)} req/s (${(throughputBytesSec / 1024).toFixed(1)} KB/s)`);
  console.log(`  Total Requests:  ${totalRequests}`);
  console.log(`  2xx Responses:   ${count2xx}`);
  console.log(`  4xx Responses:   ${count4xx} (${count429} rate-limited 429)`);
  console.log(`  5xx Responses:   ${count5xx}`);
  console.log(`  Errors/Timeouts: ${errors} errors, ${timeouts} timeouts`);
  console.log(`  Error Rate:      ${errorRatePct.toFixed(2)}%`);
  console.log(`  Latency p50:     ${p50.toFixed(2)} ms`);
  console.log(`  Latency p95:     ${p95.toFixed(2)} ms`);
  console.log(`  Latency p99:     ${p99.toFixed(2)} ms`);

  const passedSlo = p95 <= sloMs && failureCount === 0;
  if (!passedSlo) {
    if (failureCount > 0) {
      console.warn(`  [WARN] ${failureCount} failures/errors observed.`);
    }
    if (p95 > sloMs) {
      console.warn(`  [WARN] p95 latency ${p95.toFixed(2)} ms exceeded SLO of ${sloMs} ms.`);
    }
  } else {
    console.log(`  [PASS] Met SLO: p95 ${p95.toFixed(2)} ms <= ${sloMs} ms with 0 errors.`);
  }

  return {
    endpoint: endpointName,
    throughputReqSec,
    totalRequests,
    count2xx,
    count4xx,
    count5xx,
    errorRatePct,
    p50,
    p95,
    p99,
    passedSlo,
  };
}

async function main() {
  const allEndpoints = [
    {
      id: "health",
      name: "GET /health",
      path: "/health",
    },
    {
      id: "account",
      name: "GET /api/accounts/:publicKey",
      path: `/api/accounts/${encodeURIComponent(publicKey)}`,
    },
    {
      id: "analytics",
      name: "GET /api/analytics/:publicKey/summary",
      path: `/api/analytics/${encodeURIComponent(publicKey)}/summary`,
    },
  ];

  let selected = allEndpoints;
  if (targetEndpoint !== "all") {
    selected = allEndpoints.filter((e) => e.id === targetEndpoint || e.name.toLowerCase().includes(targetEndpoint.toLowerCase()));
    if (selected.length === 0) {
      console.error(`Unknown endpoint filter: ${targetEndpoint}. Valid options: all, health, account, analytics`);
      process.exit(1);
    }
  }

  console.log(`Starting Autocannon Load Test Suite against ${apiUrl}`);
  console.log(`Endpoints to test: ${selected.map((e) => e.name).join(", ")}`);

  const summaries = [];
  for (const ep of selected) {
    try {
      const result = await runAutocannon(ep);
      const summary = summarizeResult(ep.name, result);
      summaries.push(summary);
    } catch (err) {
      console.error(`Failed to load test ${ep.name}:`, err.message);
      summaries.push({
        endpoint: ep.name,
        error: err.message,
        passedSlo: false,
      });
    }
  }

  console.log(`\n============================================================`);
  console.log(`LOAD TEST SUMMARY TABLE`);
  console.log(`============================================================`);
  console.log(
    `Endpoint`.padEnd(35) +
      `Req/s`.padEnd(12) +
      `p50 (ms)`.padEnd(12) +
      `p95 (ms)`.padEnd(12) +
      `p99 (ms)`.padEnd(12) +
      `Error %`.padEnd(10) +
      `Status`
  );
  console.log("-".repeat(95));

  let anyFailed = false;
  for (const s of summaries) {
    if (s.error) {
      console.log(`${s.endpoint.padEnd(35)} ERROR: ${s.error}`);
      anyFailed = true;
      continue;
    }
    const status = s.passedSlo ? "PASS" : "FAIL";
    if (!s.passedSlo) anyFailed = true;
    console.log(
      `${s.endpoint.padEnd(35)}` +
        `${s.throughputReqSec.toFixed(1)}`.padEnd(12) +
        `${s.p50.toFixed(2)}`.padEnd(12) +
        `${s.p95.toFixed(2)}`.padEnd(12) +
        `${s.p99.toFixed(2)}`.padEnd(12) +
        `${s.errorRatePct.toFixed(2)}%`.padEnd(10) +
        status
    );
  }

  if (anyFailed && process.env.STRICT_SLO === "true") {
    console.error("\nLoad test finished with SLO breaches or errors.");
    process.exit(1);
  }

  console.log("\nLoad test completed successfully.");
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error running load test:", err);
    process.exit(1);
  });
}

module.exports = { runAutocannon, summarizeResult };
