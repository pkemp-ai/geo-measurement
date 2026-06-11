// Single adapter for every surface-under-test. One interface:
//   querySurface(prompt, surface) -> { text, citations[], model, raw }
// Adding or swapping a surface is a config change in surfaces.mjs, not here.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function querySurface(prompt, surface, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Used by OpenRouter for attribution; harmless if ignored.
      "HTTP-Referer": "https://lobogrowth.com",
      "X-Title": "Lobo Growth AEO Audit",
    },
    body: JSON.stringify({
      model: surface.model,
      messages: [{ role: "user", content: prompt }],
      // Web search ON. OpenRouter routes to native provider search for
      // Anthropic / OpenAI / Perplexity; Exa is the fallback for others.
      plugins: [{ id: "web" }],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${surface.id} -> ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  const citations = (msg.annotations ?? [])
    .filter((a) => a?.type === "url_citation" && a.url_citation)
    .map((a) => ({ url: a.url_citation.url, title: a.url_citation.title ?? null }));

  return {
    text: typeof msg.content === "string" ? msg.content : "",
    citations,
    model: data.model ?? surface.model,
    raw: data,
  };
}

// Plain completion — NO web search, temp 0 by default. For the deterministic-ish
// judge/extraction calls in the pipeline (e.g. consideration-set extraction in
// classify.mjs), not the grounded surfaces under test. Pin `model` to a dated
// snapshot so re-runs stay comparable.
export async function complete(prompt, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  if (!opts.model) throw new Error("complete() needs a model");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lobogrowth.com",
      "X-Title": "Lobo Growth AEO Audit",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: prompt }],
      temperature: opts.temperature ?? 0,
      ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter complete -> ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  return { text: typeof msg.content === "string" ? msg.content : "", model: data.model ?? opts.model, raw: data };
}
