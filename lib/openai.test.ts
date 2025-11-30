import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenAI class
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      // Mock instance if needed
    })),
  };
});

describe('openai', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should initialize openai client when API key is present', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { openai, isOpenAIConfigured } = await import('./openai');
    expect(openai).toBeDefined();
    expect(isOpenAIConfigured()).toBe(true);
  });

  it('should not initialize openai client when API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { openai, isOpenAIConfigured } = await import('./openai');
    expect(openai).toBeNull();
    expect(isOpenAIConfigured()).toBe(false);
  });

  it('should use default model name if not specified', async () => {
    delete process.env.OPENAI_MODEL_NAME;
    const { getModelName } = await import('./openai');
    expect(getModelName()).toBe('gpt-4o-mini');
  });

  it('should use configured model name', async () => {
    process.env.OPENAI_MODEL_NAME = 'gpt-4';
    const { getModelName } = await import('./openai');
    expect(getModelName()).toBe('gpt-4');
  });
});