import { useCallback, useRef } from "react";
import toast from "react-hot-toast";

import { useAppStore } from "../store";

export function useStream() {
  const {
    addMessage,
    updateMessageById,
    setStreaming,
    setStage,
    setCitationsForChat,
    addCitationsForChat,
    setVerdictForChat,
  } = useAppStore();

  const streamRef = useRef(null);
  const streamIdRef = useRef(0);

  const abort = useCallback(() => {
    if (streamRef.current?.abort) {
      streamRef.current.abort();
      streamRef.current = null;
    }
    setStreaming(false);
    setStage(null);
  }, [setStage, setStreaming]);

  const startStream = useCallback(
    (buildStream, userMessage = null, options = {}) => {
      const { chatId, userRole = "user" } = options;
      if (!chatId) {
        toast.error("Select a chat before sending a message.");
        return;
      }

      abort();

      const currentStreamId = streamIdRef.current + 1;
      streamIdRef.current = currentStreamId;

      if (userMessage) {
        addMessage(chatId, {
          role: userRole,
          content: userMessage,
          chat_id: chatId,
          created_at: new Date().toISOString(),
        });
      }

      const assistantMessageId = `assistant-stream-${Date.now()}-${Math.random()}`;

      addMessage(chatId, {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        citations: [],
        chat_id: chatId,
        isStreaming: true,
        created_at: new Date().toISOString(),
      });

      setStreaming(true);
      setStage(null);
      setCitationsForChat(chatId, []);
      setVerdictForChat(chatId, null);

      let fullText = "";
      let finalCitations = [];

      const stream = buildStream({
        onStage: (stage) => {
          if (streamIdRef.current !== currentStreamId) return;
          setStage(stage);
          updateMessageById(chatId, assistantMessageId, { stage });
        },
        onToken: (token) => {
          if (streamIdRef.current !== currentStreamId) return;
          fullText += token;
          updateMessageById(chatId, assistantMessageId, {
            content: fullText,
            isStreaming: true,
          });
        },
        onCitations: (citations) => {
          if (streamIdRef.current !== currentStreamId) return;
          finalCitations = Array.isArray(citations) ? citations : [];
          addCitationsForChat(chatId, finalCitations);
          updateMessageById(chatId, assistantMessageId, {
            citations: finalCitations,
          });
        },
        onProbability: (probability) => {
          if (streamIdRef.current !== currentStreamId) return;
          setVerdictForChat(chatId, probability);
        },
        onDone: () => {
          if (streamIdRef.current !== currentStreamId) return;
          setStreaming(false);
          setStage(null);
          updateMessageById(chatId, assistantMessageId, {
            isStreaming: false,
            content: fullText || "No response generated.",
            citations: finalCitations,
          });
        },
        onError: (errorText) => {
          if (streamIdRef.current !== currentStreamId) return;
          setStreaming(false);
          setStage(null);
          updateMessageById(chatId, assistantMessageId, {
            isStreaming: false,
            isError: true,
            content: fullText || `Error: ${errorText}`,
            citations: finalCitations,
          });
          toast.error(typeof errorText === "string" ? errorText : "Streaming failed.");
        },
      });

      streamRef.current = stream;
    },
    [
      abort,
      addCitationsForChat,
      addMessage,
      setCitationsForChat,
      setStage,
      setStreaming,
      setVerdictForChat,
      updateMessageById,
    ],
  );

  return { startStream, abort };
}

