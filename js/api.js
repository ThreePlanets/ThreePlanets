/**
 * AI API abstraction layer supporting OpenAI and Ollama providers.
 */

class AIProvider {
  /**
   * @param {object} config
   * @param {"openai"|"ollama"} config.provider
   * @param {string} config.baseUrl
   * @param {string} config.apiKey    - Required for OpenAI
   * @param {string} config.model
   * @param {number} config.temperature
   * @param {string} config.systemPrompt
   */
  constructor(config) {
    this.provider = config.provider;
    this.baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
    this.apiKey = config.apiKey || "";
    this.model = config.model || "";
    this.temperature = config.temperature ?? 0.7;
    this.systemPrompt = config.systemPrompt || "";
  }

  /**
   * Send a chat request and stream the response.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {function(string): void} onChunk - Called with each text chunk.
   * @param {AbortSignal} [signal]
   * @returns {Promise<string>} The complete response text.
   */
  async chat(messages, onChunk, signal) {
    if (this.provider === "openai") {
      return this._openaiChat(messages, onChunk, signal);
    }
    return this._ollamaChat(messages, onChunk, signal);
  }

  /* ---- OpenAI ---- */
  async _openaiChat(messages, onChunk, signal) {
    const allMessages = this._prependSystem(messages);
    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        temperature: this.temperature,
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errorBody}`);
    }

    return this._readSSE(res.body, (data) => {
      if (data === "[DONE]") return null;
      try {
        const parsed = JSON.parse(data);
        return parsed.choices?.[0]?.delta?.content || "";
      } catch {
        return "";
      }
    }, onChunk, signal);
  }

  /* ---- Ollama ---- */
  async _ollamaChat(messages, onChunk, signal) {
    const allMessages = this._prependSystem(messages);
    const url = `${this.baseUrl}/api/chat`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: true,
        options: { temperature: this.temperature },
      }),
      signal,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${errorBody}`);
    }

    return this._readNDJSON(res.body, (obj) => {
      return obj.message?.content || "";
    }, onChunk, signal);
  }

  /* ---- Helpers ---- */

  _prependSystem(messages) {
    if (!this.systemPrompt) return messages;
    return [{ role: "system", content: this.systemPrompt }, ...messages];
  }

  /**
   * Read a Server-Sent Events stream (used by OpenAI).
   */
  async _readSSE(body, extractContent, onChunk, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          const content = extractContent(data);
          if (content === null) break;
          if (content) {
            full += content;
            onChunk(content);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return full;
  }

  /**
   * Read a newline-delimited JSON stream (used by Ollama).
   */
  async _readNDJSON(body, extractContent, onChunk, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            const content = extractContent(obj);
            if (content) {
              full += content;
              onChunk(content);
            }
            if (obj.done) break;
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return full;
  }
}

// Export for test environments (Node.js)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { AIProvider };
}
