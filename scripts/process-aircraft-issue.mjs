import fs from "node:fs";
import { pathToFileURL } from "node:url";

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    setOutput("error_message", error.message);
    console.error(error.message);
    process.exit(1);
  }
}

export function main({
  csvPath = process.env.CSV_PATH || "assets/aircraft_weights.csv",
  issueBody = process.env.ISSUE_BODY || "",
  issueCreatedAt = process.env.ISSUE_CREATED_AT || new Date().toISOString()
} = {}) {
  const fields = parseIssueBody(issueBody);
  const aircraft = normaliseAircraft(fields["Aircraft tail number"]);
  const weight = normaliseWeight(fields["Aircraft weight (kg)"]);
  assertConfirmation(fields["Confirmation"]);

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const timestamp = new Date(issueCreatedAt).toISOString();
  const existingIndex = rows.findIndex((row) => row.aircraft.toUpperCase() === aircraft.toUpperCase());

  let changeAction = "added";

  if (existingIndex >= 0) {
    const existingWeight = normaliseWeight(rows[existingIndex].weight);

    if (existingWeight === weight) {
      changeAction = "no-change";
    } else {
      rows[existingIndex] = {
        Timestamp: timestamp,
        aircraft,
        weight
      };
      changeAction = "updated";
    }
  } else {
    rows.push({
      Timestamp: timestamp,
      aircraft,
      weight
    });
  }

  if (changeAction !== "no-change") {
    rows.sort((left, right) => left.aircraft.localeCompare(right.aircraft, undefined, {
      numeric: true,
      sensitivity: "base"
    }));
    fs.writeFileSync(csvPath, stringifyCsv(rows));
  }

  setOutput("aircraft", aircraft);
  setOutput("weight", weight);
  setOutput("change_action", changeAction);

  return {
    aircraft,
    weight,
    changeAction
  };
}

export function parseIssueBody(markdown) {
  const normalised = markdown.replace(/\r\n/g, "\n").trim();
  const fields = {};

  if (!normalised) {
    return fields;
  }

  let currentLabel = "";
  let currentValueLines = [];

  const flushField = () => {
    if (!currentLabel) {
      return;
    }

    fields[currentLabel] = currentValueLines.join("\n").trim();
  };

  normalised.split("\n").forEach((line) => {
    const headingMatch = line.match(/^###\s+(.+?)\s*$/);

    if (headingMatch) {
      flushField();
      currentLabel = headingMatch[1].trim();
      currentValueLines = [];
      return;
    }

    if (currentLabel) {
      currentValueLines.push(line);
    }
  });

  flushField();
  return fields;
}

function normaliseAircraft(value) {
  const aircraft = (value || "").trim().replace(/\s+/g, " ").toUpperCase();

  if (!aircraft) {
    throw new Error("Aircraft tail number is required.");
  }

  if (!/^[A-Z0-9() -]+$/.test(aircraft)) {
    throw new Error("Aircraft tail number contains unsupported characters.");
  }

  return aircraft;
}

function normaliseWeight(value) {
  const parsed = Number.parseFloat(String(value || "").trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Aircraft weight must be a number above 0.");
  }

  return String(Number(parsed.toFixed(4)));
}

function assertConfirmation(value) {
  if (!/\[x\]/i.test(value || "")) {
    throw new Error("Confirmation checkbox must be ticked.");
  }
}

function parseCsv(text) {
  const rows = text.replace(/\r\n/g, "\n").trim().split("\n");

  if (!rows.length) {
    return [];
  }

  const headers = splitCsvRow(rows[0]);
  return rows.slice(1).filter(Boolean).map((line) => {
    const values = splitCsvRow(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

function splitCsvRow(line) {
  const values = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        value += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function stringifyCsv(rows) {
  const headers = ["Timestamp", "aircraft", "weight"];
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvValue(row[header] || "")).join(","));
  });

  return `${lines.join("\n")}\n`;
}

function escapeCsvValue(value) {
  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}=${String(value).replace(/\n/g, " ")}\n`);
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}
