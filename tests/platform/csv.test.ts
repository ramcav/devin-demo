import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/platform/csv";

describe("csv", () => {
  it("quotes cells with commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });

  it("neutralises text that a spreadsheet would run as a formula", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(s).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("builds a BOM-prefixed CRLF document with a header row", () => {
    expect(toCsv(["a", "b"], [["1", null]])).toBe("\uFEFFa,b\r\n1,\r\n");
  });
});
