// @ts-nocheck  (usa node:fs, sin tipos de Node en el proyecto)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { VERSION } from "../src/version";

describe("version", () => {
  it("coincide con package.json", () => {
    expect(VERSION).toBe(JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8")).version);
  });
});
