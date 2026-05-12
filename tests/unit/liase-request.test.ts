import { parseLiaseRequest } from "@@/server/lib/liase/parse-request";
import { describe, expect, it } from "vitest";

describe("Deserialization Safety with Liase Schemas", () => {
  it("should deserialize valid JSON request with source and queryType", async () => {
    const validRequest = {
      source: "test-source",
      queryType: "test-handler",
    };

    await expect(parseLiaseRequest(validRequest)).resolves.toMatchObject({
      source: "test-source",
      queryType: "test-handler",
    });
  });

  it("should throw when source field is missing", async () => {
    const invalidRequest = {
      queryType: "search",
      // missing source
    };

    await expect(parseLiaseRequest(invalidRequest)).rejects.toThrow(
      'Request must have a "source" string field',
    );
  });

  it("should throw when queryType field is missing", async () => {
    const invalidRequest = {
      source: "giphy",
      // missing queryType
    };

    await expect(parseLiaseRequest(invalidRequest)).rejects.toThrow(
      'Request must have a "queryType" string field',
    );
  });

  it("should throw on non-object input", async () => {
    await expect(parseLiaseRequest("a string")).rejects.toThrow(
      "data must be an object",
    );
  });

  it("should throw when data is not an object", async () => {
    await expect(parseLiaseRequest([1, 2, 3])).rejects.toThrow(
      "data must be an object",
    );
  });

  it("should throw for non-existent source/queryType combination", async () => {
    const unknownRequest = {
      source: "non-existent-source",
      queryType: "non-existent-handler",
    };

    await expect(parseLiaseRequest(unknownRequest)).rejects.toThrow(
      '"non-existent-source"',
    );
  });

  it("should require source to be a string", async () => {
    const badSourceType = {
      source: 123, // number instead of string
      queryType: "search",
    };

    await expect(parseLiaseRequest(badSourceType)).rejects.toThrow(
      'Request must have a "source" string field',
    );
  });

  it("should require queryType to be a string", async () => {
    const badQueryType = {
      source: "giphy",
      queryType: true, // boolean instead of string
    };

    await expect(parseLiaseRequest(badQueryType)).rejects.toThrow(
      'Request must have a "queryType" string field',
    );
  });
});
