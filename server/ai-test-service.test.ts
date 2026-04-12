import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  testOpenAI,
  testGroq,
  testGemini,
  testGrok,
  testClaude,
  testAIProvider,
} from "./ai-test-service";

// Mock fetch global
global.fetch = vi.fn();

describe("AI Test Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("testOpenAI", () => {
    it("should return success when OpenAI API responds correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testOpenAI("test-key-123", "gpt-3.5-turbo");

      expect(result.success).toBe(true);
      expect(result.provider).toBe("openai");
      expect(result.message).toContain("OK");
    });

    it("should return error when OpenAI API key is invalid", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({
          error: {
            message: "Invalid API key",
          },
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testOpenAI("invalid-key", "gpt-3.5-turbo");

      expect(result.success).toBe(false);
      expect(result.provider).toBe("openai");
      expect(result.message).toContain("Invalid API key");
    });

    it("should handle network errors", async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Network error")
      );

      const result = await testOpenAI("test-key", "gpt-3.5-turbo");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Network error");
    });
  });

  describe("testGroq", () => {
    it("should return success when Groq API responds correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testGroq("test-key-123", "llama-3.1-8b-instant");

      expect(result.success).toBe(true);
      expect(result.provider).toBe("groq");
    });

    it("should return error when Groq API key is invalid", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({
          error: {
            message: "Unauthorized",
          },
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testGroq("invalid-key", "llama-3.1-8b-instant");

      expect(result.success).toBe(false);
      expect(result.provider).toBe("groq");
    });
  });

  describe("testGemini", () => {
    it("should return success when Gemini API responds correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "OK",
                  },
                ],
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testGemini("test-key-123", "gemini-1.5-flash");

      expect(result.success).toBe(true);
      expect(result.provider).toBe("gemini");
    });

    it("should return error when Gemini API key is invalid", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({
          error: {
            message: "API key not valid",
          },
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testGemini("invalid-key", "gemini-1.5-flash");

      expect(result.success).toBe(false);
      expect(result.provider).toBe("gemini");
    });
  });

  describe("testGrok", () => {
    it("should return success when Grok API responds correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testGrok("test-key-123", "grok-1");

      expect(result.success).toBe(true);
      expect(result.provider).toBe("grok");
    });
  });

  describe("testClaude", () => {
    it("should return success when Claude API responds correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: "OK",
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testClaude("test-key-123", "claude-3-sonnet");

      expect(result.success).toBe(true);
      expect(result.provider).toBe("claude");
    });

    it("should return error when Claude API key is invalid", async () => {
      const mockResponse = {
        ok: false,
        json: async () => ({
          error: {
            message: "Authentication failed",
          },
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testClaude("invalid-key", "claude-3-sonnet");

      expect(result.success).toBe(false);
      expect(result.provider).toBe("claude");
    });
  });

  describe("testAIProvider", () => {
    it("should route to correct provider test function", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testAIProvider("openai", "test-key", "gpt-3.5-turbo");

      expect(result.provider).toBe("openai");
      expect(result.success).toBe(true);
    });

    it("should return error for unknown provider", async () => {
      const result = await testAIProvider(
        "unknown-provider",
        "test-key",
        "model"
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("desconhecido");
    });

    it("should handle case-insensitive provider names", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK",
              },
            },
          ],
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await testAIProvider("OPENAI", "test-key", "gpt-3.5-turbo");

      expect(result.provider).toBe("openai");
      expect(result.success).toBe(true);
    });
  });
});
