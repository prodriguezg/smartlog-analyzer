import { expect } from "chai";
import { describe, it } from "mocha";
import { readAnalysisLimits } from "../src/analysis-limits.js";

describe("Analysis limit configuration", function () {
  it("retains the default for each omitted variable", function () {
    expect(readAnalysisLimits({})).to.deep.equal({ maxLogs: 100, maxKiB: 32 });
    expect(readAnalysisLimits({ ANALYSIS_MAX_LOGS: "10" })).to.deep.equal({ maxLogs: 10, maxKiB: 32 });
    expect(readAnalysisLimits({ ANALYSIS_MAX_KIB: "4" })).to.deep.equal({ maxLogs: 100, maxKiB: 4 });
  });

  it("reports the variable name for invalid limits", function () {
    for (const name of ["ANALYSIS_MAX_LOGS", "ANALYSIS_MAX_KIB"]) {
      for (const value of ["", "0", "-2", "1.5", "1e3", "foo", "9007199254740991"]) {
        expect(() => readAnalysisLimits({ [name]: value })).to.throw(name);
      }
    }
  });
});
