import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { main, parseIssueBody } from "./process-aircraft-issue.mjs";

test("parseIssueBody extracts values from GitHub issue form markdown", () => {
  const fields = parseIssueBody(`### Aircraft tail number

ZE999

### Aircraft weight (kg)

420.5

### Confirmation

- [x] I have checked the aircraft tail number and weight before submitting.`);

  assert.deepEqual(fields, {
    "Aircraft tail number": "ZE999",
    "Aircraft weight (kg)": "420.5",
    Confirmation: "- [x] I have checked the aircraft tail number and weight before submitting."
  });
});

test("main updates the CSV using the parsed aircraft submission fields", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ballast-aircraft-"));
  const csvPath = path.join(tempDir, "aircraft_weights.csv");

  fs.writeFileSync(csvPath, "Timestamp,aircraft,weight\n2026-04-02T12:00:00.000Z,ZE998,400\n");

  const result = main({
    csvPath,
    issueCreatedAt: "2026-04-03T00:00:00.000Z",
    issueBody: `### Aircraft tail number

ZE999

### Aircraft weight (kg)

420.5

### Confirmation

- [x] I have checked the aircraft tail number and weight before submitting.`
  });

  assert.deepEqual(result, {
    aircraft: "ZE999",
    weight: "420.5",
    changeAction: "added"
  });
  assert.equal(
    fs.readFileSync(csvPath, "utf8"),
    "Timestamp,aircraft,weight\n2026-04-02T12:00:00.000Z,ZE998,400\n2026-04-03T00:00:00.000Z,ZE999,420.5\n"
  );
});
