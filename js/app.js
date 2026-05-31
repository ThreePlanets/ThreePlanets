/**
 * AI Chat Frontend — Main application logic.
 */
(function () {
  "use strict";

  /* ---- DOM references ---- */
  const messagesEl = document.getElementById("messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const openSettingsBtn = document.getElementById("open-settings");
  const closeSettingsBtn = document.getElementById("close-settings");
  const settingsPanel = document.getElementById("settings-panel");
  const newChatBtn = document.getElementById("new-chat");

  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const openaiSettings = document.getElementById("openai-settings");
  const ollamaSettings = document.getElementById("ollama-settings");
  const openaiApiKeyInput = document.getElementById("openai-api-key");
  const openaiBaseUrlInput = document.getElementById("openai-base-url");
  const openaiModelSelect = document.getElementById("openai-model");
  const openaiCustomModel = document.getElementById("openai-custom-model");
  const ollamaBaseUrlInput = document.getElementById("ollama-base-url");
  const ollamaModelInput = document.getElementById("ollama-model");
  const temperatureInput = document.getElementById("temperature");
  const temperatureValue = document.getElementById("temperature-value");
  const systemPromptInput = document.getElementById("system-prompt");
  const providerBadge = document.getElementById("provider-badge");
  const modelBadge = document.getElementById("model-badge");

  /* ---- State ---- */
  let chatHistory = [];
  let abortController = null;
  let isGenerating = false;

  /* ---- Settings persistence ---- */
  const STORAGE_KEY = "ai-chat-settings";

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.provider) setProvider(s.provider);
      if (s.openaiApiKey) openaiApiKeyInput.value = s.openaiApiKey;
      if (s.openaiBaseUrl) openaiBaseUrlInput.value = s.openaiBaseUrl;
      if (s.openaiModel) openaiModelSelect.value = s.openaiModel;
      if (s.openaiCustomModel) openaiCustomModel.value = s.openaiCustomModel;
      if (s.ollamaBaseUrl) ollamaBaseUrlInput.value = s.ollamaBaseUrl;
      if (s.ollamaModel) ollamaModelInput.value = s.ollamaModel;
      if (s.temperature != null) {
        temperatureInput.value = s.temperature;
        temperatureValue.textContent = s.temperature;
      }
      if (s.systemPrompt) systemPromptInput.value = s.systemPrompt;
      updateBadges();
    } catch {
      // ignore corrupt data
    }
  }

  function saveSettings() {
    const s = {
      provider: getProvider(),
      openaiApiKey: openaiApiKeyInput.value,
      openaiBaseUrl: openaiBaseUrlInput.value,
      openaiModel: openaiModelSelect.value,
      openaiCustomModel: openaiCustomModel.value,
      ollamaBaseUrl: ollamaBaseUrlInput.value,
      ollamaModel: ollamaModelInput.value,
      temperature: parseFloat(temperatureInput.value),
      systemPrompt: systemPromptInput.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    updateBadges();
  }

  /* ---- Provider helpers ---- */
  function getProvider() {
    return document.querySelector('input[name="provider"]:checked').value;
  }

  function setProvider(value) {
    const radio = document.querySelector(`input[name="provider"][value="${value}"]`);
    if (radio) radio.checked = true;
    toggleProviderSettings();
  }

  function toggleProviderSettings() {
    const provider = getProvider();
    openaiSettings.classList.toggle("hidden", provider !== "openai");
    ollamaSettings.classList.toggle("hidden", provider !== "ollama");
    updateBadges();
  }

  function getModel() {
    if (getProvider() === "openai") {
      return openaiCustomModel.value.trim() || openaiModelSelect.value;
    }
    return ollamaModelInput.value.trim() || "llama3";
  }

  function updateBadges() {
    const provider = getProvider();
    providerBadge.textContent = provider === "openai" ? "OpenAI" : "Ollama";
    modelBadge.textContent = getModel();
  }

  function buildProvider() {
    const provider = getProvider();
    return new AIProvider({
      provider,
      baseUrl: provider === "openai" ? openaiBaseUrlInput.value : ollamaBaseUrlInput.value,
      apiKey: openaiApiKeyInput.value,
      model: getModel(),
      temperature: parseFloat(temperatureInput.value),
      systemPrompt: systemPromptInput.value.trim(),
    });
  }

  /* ---- Message rendering ---- */
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function appendMessage(role, content) {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.innerHTML = escapeHtml(content);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
    scrollToBottom();

    return bubble;
  }

  function appendError(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "message error";
    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  function appendTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className = "message assistant";
    wrapper.id = "typing-indicator";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-content typing-indicator";
    bubble.innerHTML = "<span></span><span></span><span></span>";

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ---- Core chat logic ---- */
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isGenerating) return;

    // Validate settings
    if (getProvider() === "openai" && !openaiApiKeyInput.value.trim()) {
      appendError("Please set your OpenAI API key in Settings.");
      settingsPanel.classList.remove("hidden");
      return;
    }

    // Add user message
    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });
    userInput.value = "";
    autoResize();

    // Show typing indicator
    appendTypingIndicator();
    isGenerating = true;
    sendBtn.disabled = true;

    abortController = new AbortController();
    const ai = buildProvider();

    let assistantBubble = null;
    let fullText = "";

    try {
      await ai.chat(
        chatHistory,
        (chunk) => {
          removeTypingIndicator();
          if (!assistantBubble) {
            assistantBubble = appendMessage("assistant", "");
          }
          fullText += chunk;
          assistantBubble.innerHTML = escapeHtml(fullText);
          scrollToBottom();
        },
        abortController.signal
      );

      if (!fullText) {
        removeTypingIndicator();
        fullText = "(No response)";
        appendMessage("assistant", fullText);
      }

      chatHistory.push({ role: "assistant", content: fullText });
    } catch (err) {
      removeTypingIndicator();
      if (err.name !== "AbortError") {
        appendError(`Error: ${err.message}`);
      }
    } finally {
      isGenerating = false;
      sendBtn.disabled = false;
      abortController = null;
      saveSettings();
    }
  }

  /* ---- Auto-resize textarea ---- */
  function autoResize() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
  }

  /* ---- Event listeners ---- */
  sendBtn.addEventListener("click", sendMessage);

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener("input", autoResize);

  openSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
    saveSettings();
  });

  providerRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      toggleProviderSettings();
      saveSettings();
    });
  });

  temperatureInput.addEventListener("input", () => {
    temperatureValue.textContent = temperatureInput.value;
  });

  // Save on any settings change
  [openaiApiKeyInput, openaiBaseUrlInput, openaiCustomModel, ollamaBaseUrlInput, ollamaModelInput, systemPromptInput].forEach((el) => {
    el.addEventListener("change", saveSettings);
  });

  openaiModelSelect.addEventListener("change", saveSettings);
  temperatureInput.addEventListener("change", saveSettings);

  newChatBtn.addEventListener("click", () => {
    if (isGenerating && abortController) {
      abortController.abort();
    }
    chatHistory = [];
    messagesEl.innerHTML = "";
    isGenerating = false;
    sendBtn.disabled = false;
  });

  /* ---- Init ---- */
  loadSettings();
})();
