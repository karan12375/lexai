import axios from "axios";

import { supabase } from "../lib/supabase";
import { useAppStore } from "../store";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE,
  timeout: 45000,
});

const responseCache = new Map();
const pendingRequests = new Map();

const CACHE_STALE = {
  workspaces: 45_000,
  workspaceStats: 20_000,
  chats: 20_000,
  messages: 10_000,
  documents: 15_000,
  references: 30_000,
  profile: 120_000,
};

function toMessage(error) {
  if (!error) return "Unexpected error.";
  if (error.response?.data?.detail) return String(error.response.data.detail);
  if (typeof error.response?.data === "string") return error.response.data;
  if (error.message) return error.message;
  return "Unexpected error.";
}

export function normalizeApiError(error, fallback = "Request failed.") {
  return toMessage(error) || fallback;
}

function getCacheValue(cacheKey, staleTime) {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > staleTime) return null;
  return cached.data;
}

function setCacheValue(cacheKey, data) {
  responseCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

function invalidateCacheByPrefix(prefix) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

async function cachedGet(cacheKey, request, staleTime, force = false) {
  if (!force) {
    const cached = getCacheValue(cacheKey, staleTime);
    if (cached !== null) return cached;
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const task = request()
    .then((result) => setCacheValue(cacheKey, result))
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, task);
  return task;
}

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      useAppStore.getState().clearSession();
      await supabase.auth.signOut();
    }
    return Promise.reject(error);
  },
);

export const checkHealth = () => api.get("/health").then((response) => response.data);

export const getWorkspaces = ({ force = false, query = "", offset = 0, limit = 200 } = {}) =>
  cachedGet(
    `workspaces:${query}:${offset}:${limit}`,
    () =>
      api
        .get("/workspaces", {
          params: { q: query || undefined, offset, limit },
        })
        .then((response) => response.data),
    CACHE_STALE.workspaces,
    force,
  );

export const createWorkspace = async (payload) => {
  const response = await api.post("/workspaces", payload);
  invalidateCacheByPrefix("workspaces:");
  return response.data;
};

export const renameWorkspace = async (workspaceId, payload) => {
  const response = await api.patch(`/workspaces/${workspaceId}`, payload);
  invalidateCacheByPrefix("workspaces:");
  invalidateCacheByPrefix(`workspaceStats:${workspaceId}`);
  return response.data;
};

export const deleteWorkspace = async (workspaceId) => {
  const response = await api.delete(`/workspaces/${workspaceId}`);
  invalidateCacheByPrefix("workspaces:");
  invalidateCacheByPrefix(`workspaceStats:${workspaceId}`);
  invalidateCacheByPrefix(`chatThreads:${workspaceId}`);
  invalidateCacheByPrefix(`messages:${workspaceId}`);
  invalidateCacheByPrefix(`documents:${workspaceId}`);
  return response.data;
};

export const getWorkspaceStats = (workspaceId, { force = false } = {}) =>
  cachedGet(
    `workspaceStats:${workspaceId}`,
    () => api.get(`/workspaces/${workspaceId}/stats`).then((response) => response.data),
    CACHE_STALE.workspaceStats,
    force,
  );

export const getChatThreads = (
  workspaceId,
  { force = false, query = "", offset = 0, limit = 50 } = {},
) =>
  cachedGet(
    `chatThreads:${workspaceId}:${query}:${offset}:${limit}`,
    () =>
      api
        .get(`/workspaces/${workspaceId}/chat-threads`, {
          params: { q: query || undefined, offset, limit },
        })
        .then((response) => response.data),
    CACHE_STALE.chats,
    force,
  );

export const createChatThread = async (workspaceId, payload = {}) => {
  const response = await api.post(`/workspaces/${workspaceId}/chat-threads`, payload);
  invalidateCacheByPrefix(`chatThreads:${workspaceId}`);
  return response.data;
};

export const renameChatThread = async (workspaceId, chatId, payload) => {
  const response = await api.patch(`/workspaces/${workspaceId}/chat-threads/${chatId}`, payload);
  invalidateCacheByPrefix(`chatThreads:${workspaceId}`);
  return response.data;
};

export const deleteChatThread = async (workspaceId, chatId) => {
  const response = await api.delete(`/workspaces/${workspaceId}/chat-threads/${chatId}`);
  invalidateCacheByPrefix(`chatThreads:${workspaceId}`);
  invalidateCacheByPrefix(`messages:${workspaceId}:${chatId}`);
  return response.data;
};

export const getWorkspaceMessages = (
  workspaceId,
  chatId,
  { force = false, offset = 0, limit = 60 } = {},
) =>
  cachedGet(
    `messages:${workspaceId}:${chatId || "none"}:${offset}:${limit}`,
    () =>
      api
        .get(`/workspaces/${workspaceId}/messages`, {
          params: {
            chat_id: chatId || undefined,
            offset,
            limit,
          },
        })
        .then((response) => response.data),
    CACHE_STALE.messages,
    force,
  );

export const listDocuments = (workspaceId, { force = false } = {}) =>
  cachedGet(
    `documents:${workspaceId}`,
    () => api.get(`/workspaces/${workspaceId}/documents`).then((response) => response.data),
    CACHE_STALE.documents,
    force,
  );

export const uploadDocuments = async (workspaceId, files, onProgress) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const response = await api.post(`/workspaces/${workspaceId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (typeof onProgress === "function" && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });

  invalidateCacheByPrefix(`documents:${workspaceId}`);
  invalidateCacheByPrefix(`workspaceStats:${workspaceId}`);
  return response.data;
};

export const deleteDocument = async (workspaceId, docId) => {
  const response = await api.delete(`/workspaces/${workspaceId}/documents/${docId}`);
  invalidateCacheByPrefix(`documents:${workspaceId}`);
  invalidateCacheByPrefix(`workspaceStats:${workspaceId}`);
  return response.data;
};

export const kanoonSearch = (query, limit = 6) =>
  cachedGet(
    `kanoon:${query}:${limit}`,
    () =>
      api
        .get("/search/kanoon", {
          params: { q: query, limit },
        })
        .then((response) => response.data),
    CACHE_STALE.references,
    false,
  );

export const downloadReport = async (payload) => {
  const response = await api.post("/report/generate", payload, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `LexAI_Brief_${payload.workspace_id?.slice(0, 8)}.docx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

function parseSSEBuffer(buffer, onEvent) {
  const chunks = buffer.split("\n\n");
  const carry = chunks.pop() || "";
  chunks.forEach((block) => {
    const lines = block.split("\n");
    const dataLines = lines.filter((line) => line.startsWith("data: "));
    if (!dataLines.length) return;
    const raw = dataLines.map((line) => line.slice(6)).join("\n").trim();
    if (!raw) return;
    try {
      onEvent(JSON.parse(raw));
    } catch {
      // Ignore malformed chunk.
    }
  });
  return carry;
}

export function createStream(endpoint, payload, callbacks = {}) {
  const {
    onStage = () => {},
    onToken = () => {},
    onCitations = () => {},
    onProbability = () => {},
    onDone = () => {},
    onError = () => {},
  } = callbacks;

  const controller = new AbortController();
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };

  const fail = (message) => {
    if (done) return;
    done = true;
    onError(message);
  };

  (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        fail(errorText || "Streaming request failed");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        fail("Streaming reader unavailable");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        if (controller.signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseSSEBuffer(buffer, (event) => {
          switch (event.type) {
            case "stage":
              onStage(event.stage);
              break;
            case "token":
              onToken(event.token || "");
              break;
            case "citations":
              onCitations(event.citations || []);
              break;
            case "probability":
              onProbability(event.probability);
              break;
            case "done":
              finish();
              break;
            case "error":
              fail(event.error || "Unknown stream error");
              break;
            default:
              break;
          }
        });
      }

      if (!controller.signal.aborted) finish();
    } catch (error) {
      if (controller.signal.aborted) return;
      fail(normalizeApiError(error, "Stream error"));
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

export const streamChat = (workspaceId, message, history, chatId, callbacks) =>
  createStream(
    "/chat/stream",
    {
      workspace_id: workspaceId,
      message,
      conversation_history: history,
      chat_id: chatId || undefined,
    },
    callbacks,
  );

export const streamCounterArgs = (workspaceId, petitionText, chatId, callbacks) =>
  createStream(
    "/counter-arguments/stream",
    {
      workspace_id: workspaceId,
      petition_text: petitionText,
      chat_id: chatId || undefined,
    },
    callbacks,
  );

export const streamVerdict = (workspaceId, caseFacts, chatId, callbacks) =>
  createStream(
    "/verdict/stream",
    {
      workspace_id: workspaceId,
      case_facts: caseFacts,
      chat_id: chatId || undefined,
    },
    callbacks,
  );

export const streamDraft = (docType, details, workspaceId, chatId, callbacks) =>
  createStream(
    "/draft/stream",
    {
      doc_type: docType,
      details,
      workspace_id: workspaceId || undefined,
      chat_id: chatId || undefined,
    },
    callbacks,
  );

export const streamSearch = (workspaceId, query, chatId, callbacks) =>
  createStream(
    "/search/stream",
    {
      workspace_id: workspaceId,
      query,
      chat_id: chatId || undefined,
    },
    callbacks,
  );

