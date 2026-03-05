import { nanoid } from "nanoid";
import { db } from "./db.js";

/**
 * Creates a new run record with "pending" status
 * @param {Object} options
 * @param {string} [options.specId] - Optional spec ID
 * @param {string} [options.specVersion] - Optional spec version
 * @param {string} options.model - Model name used for this run
 * @param {any} options.inputBlocks - Input data (will be JSON stringified)
 * @returns {string} The created run ID
 */
export function createRun({ specId, specVersion, model, inputBlocks }) {
  const runId = `run_${nanoid(16)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO runs 
     (id, spec_id, spec_version, model, status, input_blocks, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    specId || null,
    specVersion || null,
    model,
    "pending",
    JSON.stringify(inputBlocks),
    now
  );

  return runId;
}

/**
 * Marks a run as successful and stores the raw output
 * @param {string} runId - The run ID
 * @param {any} rawOutput - The raw LLM output (will be JSON stringified)
 */
export function completeRunSuccess(runId, rawOutput, options = {}) {
  const now = new Date().toISOString();
  const metricsJson = options.metrics ? JSON.stringify(options.metrics) : null;
  db.prepare(
    `UPDATE runs 
     SET status = ?, raw_output = ?, metrics_json = ?, completed_at = ?
     WHERE id = ?`
  ).run("success", JSON.stringify(rawOutput), metricsJson, now, runId);
}

/**
 * Marks a run as failed and creates an error record
 * @param {string} runId - The run ID
 * @param {string} errorType - Error type (e.g., "runtime_exception", "unknown")
 * @param {any} details - Error details (will be JSON stringified if object)
 * @param {string} [detectedBy="system"] - Who detected the error
 */
export function completeRunFailure(runId, errorType, details, detectedBy = "system") {
  const now = new Date().toISOString();
  const errorId = `err_${nanoid(16)}`;

  // Update run status
  db.prepare(
    `UPDATE runs 
     SET status = ?, completed_at = ?
     WHERE id = ?`
  ).run("failed", now, runId);

  // Insert error record
  db.prepare(
    `INSERT INTO run_errors 
     (id, run_id, error_type, details, detected_by, created_at) 
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    errorId,
    runId,
    errorType,
    typeof details === "string" ? details : JSON.stringify(details),
    detectedBy,
    now
  );

  return errorId;
}

