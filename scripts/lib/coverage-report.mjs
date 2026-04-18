import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const COVERAGE_START = "# start of coverage report";
const COVERAGE_END = "# end of coverage report";
const COVERAGE_ROW_PATTERN = /^# (.+?) \| ([0-9.]+) \| ([0-9.]+) \| ([0-9.]+) \| ?(.*)$/;

function parseUncoveredLines(text) {
  return text
    .split(",")
    .map((segment) => Number.parseInt(segment.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(2);
}

function formatUncoveredLines(lines) {
  return lines.length ? lines.join(", ") : "";
}

function writeStream(stream, text) {
  if (!text) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    stream.write(text, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function countFileLines(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, "utf8");
  if (!content.length) {
    return 0;
  }
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}

function computeLineCoverage(lineCount, uncoveredLines, fallbackPercent) {
  if (!Number.isInteger(lineCount) || lineCount <= 0) {
    return fallbackPercent;
  }
  const visibleUncovered = uncoveredLines.filter((line) => line <= lineCount);
  return ((lineCount - visibleUncovered.length) / lineCount) * 100;
}

function aggregatePercent(rows, fieldName) {
  const weighted = rows.reduce(
    (state, row) => {
      const weight = Number.isInteger(row.lineCount) && row.lineCount > 0 ? row.lineCount : 1;
      return {
        totalWeight: state.totalWeight + weight,
        weightedValue: state.weightedValue + row[fieldName] * weight
      };
    },
    { totalWeight: 0, weightedValue: 0 }
  );
  if (weighted.totalWeight <= 0) {
    return 0;
  }
  return weighted.weightedValue / weighted.totalWeight;
}

export async function collectWorkspaceCoverageTestFiles(rootDir, { excludedTestNames = new Set() } = {}) {
  const testDir = join(rootDir, "test");
  const entries = await readdir(testDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js") && !excludedTestNames.has(entry.name))
    .map((entry) => join("test", entry.name))
    .sort((a, b) => a.localeCompare(b, "en-US"));
}

export function normalizeCoverageReport(text, { rootDir } = {}) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.indexOf(COVERAGE_START);
  const endIndex = lines.indexOf(COVERAGE_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      text,
      duplicateFiles: [],
      normalizedFileCount: 0
    };
  }

  const before = lines.slice(0, startIndex);
  const coverageBody = lines.slice(startIndex + 1, endIndex);
  const after = lines.slice(endIndex + 1);

  const rows = [];
  for (const line of coverageBody) {
    const match = line.match(COVERAGE_ROW_PATTERN);
    if (!match) {
      continue;
    }
    rows.push({
      file: match[1],
      linePercent: Number.parseFloat(match[2]),
      branchPercent: Number.parseFloat(match[3]),
      functionPercent: Number.parseFloat(match[4]),
      uncoveredLines: parseUncoveredLines(match[5] ?? "")
    });
  }

  const detailRows = rows.filter((row) => row.file !== "all files");
  const grouped = new Map();
  for (const row of detailRows) {
    const existing = grouped.get(row.file) ?? [];
    existing.push(row);
    grouped.set(row.file, existing);
  }

  const normalizedRows = Array.from(grouped.entries())
    .map(([file, fileRows]) => {
      const lineCount = rootDir ? countFileLines(resolve(rootDir, file)) : null;
      const uncoveredSet = new Set();
      for (const row of fileRows) {
        for (const line of row.uncoveredLines) {
          uncoveredSet.add(line);
        }
      }
      const uncoveredLines = Array.from(uncoveredSet).sort((a, b) => a - b);
      return {
        file,
        rows: fileRows,
        lineCount,
        uncoveredLines,
        linePercent: computeLineCoverage(
          lineCount,
          uncoveredLines,
          Math.min(...fileRows.map((row) => row.linePercent))
        ),
        branchPercent: Math.min(...fileRows.map((row) => row.branchPercent)),
        functionPercent: Math.min(...fileRows.map((row) => row.functionPercent))
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file, "en-US"));

  const duplicateFiles = normalizedRows.filter((row) => row.rows.length > 1).map((row) => row.file);
  const allRowsHaveLineCounts =
    normalizedRows.length > 0 &&
    normalizedRows.every((row) => Number.isInteger(row.lineCount) && row.lineCount >= 0);
  const totalLines = allRowsHaveLineCounts
    ? normalizedRows.reduce((sum, row) => sum + row.lineCount, 0)
    : 0;
  const totalUncovered = allRowsHaveLineCounts
    ? normalizedRows.reduce(
        (sum, row) => sum + row.uncoveredLines.filter((line) => line <= row.lineCount).length,
        0
      )
    : 0;
  const summaryLinePercent = totalLines > 0 ? ((totalLines - totalUncovered) / totalLines) * 100 : 0;
  const summaryBranchPercent = aggregatePercent(normalizedRows, "branchPercent");
  const summaryFunctionPercent = aggregatePercent(normalizedRows, "functionPercent");

  const renderedCoverage = [
    COVERAGE_START,
    "# file | line % | branch % | funcs % | uncovered lines",
    ...normalizedRows.map(
      (row) =>
        `# ${row.file} | ${formatPercent(row.linePercent)} | ${formatPercent(row.branchPercent)} | ${formatPercent(
          row.functionPercent
        )} | ${formatUncoveredLines(row.uncoveredLines)}`
    ),
    `# all files | ${formatPercent(summaryLinePercent)} | ${formatPercent(summaryBranchPercent)} | ${formatPercent(
      summaryFunctionPercent
    )} |`,
    COVERAGE_END
  ];

  const normalizedText = [...before, ...renderedCoverage, ...after].join("\n");
  return {
    text: normalizedText,
    duplicateFiles,
    normalizedFileCount: normalizedRows.length
  };
}

export async function runWorkspaceCoverage({
  rootDir,
  excludedTestNames = new Set(),
  stdout = process.stdout,
  stderr = process.stderr,
  listOnly = false
}) {
  const testFiles = await collectWorkspaceCoverageTestFiles(rootDir, { excludedTestNames });
  if (!testFiles.length) {
    stderr.write("[coverage] no test files selected.\n");
    return 1;
  }

  if (listOnly) {
    await writeStream(stdout, `${testFiles.join("\n")}\n`);
    return 0;
  }

  const child = spawn(process.execPath, ["--test", "--experimental-test-coverage", ...testFiles], {
    cwd: rootDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let capturedStdout = "";
  let capturedStderr = "";
  child.stdout.on("data", (chunk) => {
    capturedStdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    capturedStderr += chunk;
  });

  const result = await new Promise((resolvePromise) => {
    child.on("exit", (code, signal) => resolvePromise({ code, signal }));
  });

  if (capturedStderr) {
    await writeStream(stderr, capturedStderr);
  }

  const normalized = normalizeCoverageReport(capturedStdout, { rootDir });
  await writeStream(stdout, normalized.text);
  if (normalized.duplicateFiles.length) {
    await writeStream(
      stdout,
      `\n[coverage] normalized duplicate file rows: ${normalized.duplicateFiles.join(", ")}.\n`
    );
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
    return 1;
  }
  return result.code ?? 1;
}
