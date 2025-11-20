import OpenAI from "openai";

// Get OpenAI API key from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const modelName = process.env.OPENAI_MODEL_NAME || "gpt-4o-mini";

if (!apiKey) {
  console.warn("OPENAI_API_KEY is not set. AI features will not work.");
}

// Create OpenAI client instance
export const openai = apiKey
  ? new OpenAI({
      apiKey,
    })
  : null;

// Get the model name
export const getModelName = () => modelName;

// Helper function to check if OpenAI is configured
export const isOpenAIConfigured = () => !!apiKey;


