// AEO/GEO audit — the surfaces under test.
//
// All three route through OpenRouter (one endpoint, one unified `url_citation`
// annotation shape). Web search is ON for every surface — a grounded answer is
// the entire point of the audit; an ungrounded completion measures stale
// training memory and returns zero citations.
//
// OpenRouter's web plugin uses each provider's NATIVE search for Anthropic,
// OpenAI, and Perplexity (Exa is only the fallback for unsupported providers),
// so these three reflect the retrieval a real buyer would see.
//
// Model slugs are version-sensitive. Verify against https://openrouter.ai/models
// on first run — a wrong slug surfaces as a 404 "model not found" from the API.

export const SURFACES = [
  {
    id: "claude",
    label: "Claude Sonnet",
    model: "anthropic/claude-sonnet-4.6",
    note: "Heavy B2B / technical buyer usage",
  },
  {
    id: "perplexity",
    label: "Perplexity Sonar",
    model: "perplexity/sonar",
    note: "B2B research surface; natively grounded",
  },
  {
    id: "chatgpt",
    label: "ChatGPT (OpenAI)",
    model: "openai/gpt-5-mini",
    note: "#1 surface overall + client optics",
  },
];
