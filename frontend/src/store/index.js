import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const normalizeCitations = (citations = []) => {
  if (!Array.isArray(citations)) return []

  const seen = new Set()
  const unique = []

  for (const citation of citations) {
    const id =
      citation?.id ||
      citation?.url ||
      citation?.citation ||
      citation?.title ||
      `${citation?.court || ''}-${citation?.date || ''}-${citation?.section || ''}`

    if (!seen.has(id)) {
      seen.add(id)
      unique.push(citation)
    }
  }

  return unique
}

const normalizeList = (items = [], meta = {}) => ({
  items: Array.isArray(items) ? items : [],
  ...meta,
})

const defaultMeta = (meta = {}) => ({
  loading: false,
  loadedAt: 0,
  hasMore: false,
  nextOffset: 0,
  ...meta,
})

export const useAppStore = create(
  persist(
    (set, get) => ({
      authReady: false,
      session: null,
      profile: null,

      workspaces: [],
      workspacesLoadedAt: 0,
      workspacesLoading: false,
      activeWorkspaceId: null,

      activeChatByWorkspace: {},
      chatThreadsByWorkspace: {},
      chatThreadsMetaByWorkspace: {},
      messagesByChat: {},
      messagesMetaByChat: {},
      documentsByWorkspace: {},
      documentsMetaByWorkspace: {},
      citationsByChat: {},
      verdictByChat: {},

      currentStage: null,
      isStreaming: false,

      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      rightPanelOpen: true,
      activeMode: 'chat',
      selectedPage: '/workspace/dashboard',
      workspaceSearch: '',
      chatSearch: '',
      referencesQuery: '',
      referencesFilter: 'all',
      referencesCollapsedSections: {},

      setAuthReady: (authReady) => set({ authReady }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),

      clearSession: () =>
        set((state) => ({
          authReady: false,
          session: null,
          profile: null,
          workspaces: [],
          workspacesLoadedAt: 0,
          workspacesLoading: false,
          activeWorkspaceId: null,
          activeChatByWorkspace: {},
          chatThreadsByWorkspace: {},
          chatThreadsMetaByWorkspace: {},
          messagesByChat: {},
          messagesMetaByChat: {},
          documentsByWorkspace: {},
          documentsMetaByWorkspace: {},
          citationsByChat: {},
          verdictByChat: {},
          currentStage: null,
          isStreaming: false,
          sidebarCollapsed: state.sidebarCollapsed,
          mobileSidebarOpen: false,
          rightPanelOpen: state.rightPanelOpen,
          activeMode: 'chat',
          selectedPage: '/workspace/dashboard',
          workspaceSearch: '',
          chatSearch: '',
          referencesQuery: '',
          referencesFilter: 'all',
          referencesCollapsedSections: {},
        })),

      setWorkspacesLoading: (workspacesLoading) =>
        set({ workspacesLoading }),

      setWorkspaces: (workspaces) =>
        set((state) => {
          const items = Array.isArray(workspaces) ? workspaces : []
          const activeWorkspaceId = items.some((ws) => ws.id === state.activeWorkspaceId)
            ? state.activeWorkspaceId
            : items[0]?.id || null

          return {
            workspaces: items,
            activeWorkspaceId,
            workspacesLoadedAt: Date.now(),
          }
        }),

      upsertWorkspace: (workspace, setActive = false) =>
        set((state) => ({
          workspaces: [workspace, ...state.workspaces.filter((item) => item.id !== workspace.id)],
          activeWorkspaceId: setActive ? workspace.id : state.activeWorkspaceId || workspace.id,
          workspacesLoadedAt: Date.now(),
        })),

      updateWorkspace: (id, updates) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, ...updates } : workspace
          ),
        })),

      removeWorkspace: (workspaceId) =>
        set((state) => {
          const chatIds = (state.chatThreadsByWorkspace[workspaceId]?.items || []).map((chat) => chat.id).filter(Boolean)
          const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId)
          const activeWorkspaceId =
            state.activeWorkspaceId === workspaceId ? workspaces[0]?.id || null : state.activeWorkspaceId

          const activeChatByWorkspace = { ...state.activeChatByWorkspace }
          delete activeChatByWorkspace[workspaceId]

          const chatThreadsByWorkspace = { ...state.chatThreadsByWorkspace }
          delete chatThreadsByWorkspace[workspaceId]

          const chatThreadsMetaByWorkspace = { ...state.chatThreadsMetaByWorkspace }
          delete chatThreadsMetaByWorkspace[workspaceId]

          const documentsByWorkspace = { ...state.documentsByWorkspace }
          delete documentsByWorkspace[workspaceId]

          const documentsMetaByWorkspace = { ...state.documentsMetaByWorkspace }
          delete documentsMetaByWorkspace[workspaceId]

          const messagesByChat = { ...state.messagesByChat }
          const messagesMetaByChat = { ...state.messagesMetaByChat }
          const citationsByChat = { ...state.citationsByChat }
          const verdictByChat = { ...state.verdictByChat }

          chatIds.forEach((chatId) => {
            delete messagesByChat[chatId]
            delete messagesMetaByChat[chatId]
            delete citationsByChat[chatId]
            delete verdictByChat[chatId]
          })

          return {
            workspaces,
            activeWorkspaceId,
            activeChatByWorkspace,
            chatThreadsByWorkspace,
            chatThreadsMetaByWorkspace,
            documentsByWorkspace,
            documentsMetaByWorkspace,
            messagesByChat,
            messagesMetaByChat,
            citationsByChat,
            verdictByChat,
            currentStage: null,
            isStreaming: false,
          }
        }),

      setActiveWorkspaceId: (activeWorkspaceId) =>
        set((state) => ({
          activeWorkspaceId,
          selectedPage: state.selectedPage || '/workspace/dashboard',
          currentStage: null,
          isStreaming: false,
        })),

      setChatThreadsMeta: (workspaceId, meta) =>
        set((state) => ({
          chatThreadsMetaByWorkspace: {
            ...state.chatThreadsMetaByWorkspace,
            [workspaceId]: defaultMeta({ ...state.chatThreadsMetaByWorkspace[workspaceId], ...meta }),
          },
        })),

      setChatThreads: (workspaceId, threads, opts = {}) =>
        set((state) => {
          const existing = state.chatThreadsByWorkspace[workspaceId]?.items || []
          const items = opts.append
            ? [...existing, ...threads.filter((thread) => !existing.some((item) => item.id === thread.id))]
            : Array.isArray(threads)
            ? threads
            : []
          const activeChatId = state.activeChatByWorkspace[workspaceId]
          const hasActive = items.some((thread) => thread.id === activeChatId)

          return {
            chatThreadsByWorkspace: {
              ...state.chatThreadsByWorkspace,
              [workspaceId]: normalizeList(items, { loadedAt: Date.now() }),
            },
            chatThreadsMetaByWorkspace: {
              ...state.chatThreadsMetaByWorkspace,
              [workspaceId]: defaultMeta({
                ...state.chatThreadsMetaByWorkspace[workspaceId],
                loading: false,
                loadedAt: Date.now(),
                hasMore: opts.hasMore ?? false,
                nextOffset: opts.nextOffset ?? items.length,
              }),
            },
            activeChatByWorkspace: {
              ...state.activeChatByWorkspace,
              [workspaceId]: hasActive ? activeChatId : items[0]?.id || null,
            },
          }
        }),

      upsertChatThread: (workspaceId, thread, setActive = true) =>
        set((state) => {
          const existing = state.chatThreadsByWorkspace[workspaceId]?.items || []
          const items = [thread, ...existing.filter((item) => item.id !== thread.id)]

          return {
            chatThreadsByWorkspace: {
              ...state.chatThreadsByWorkspace,
              [workspaceId]: normalizeList(items, { loadedAt: Date.now() }),
            },
            activeChatByWorkspace: {
              ...state.activeChatByWorkspace,
              [workspaceId]: setActive ? thread.id : state.activeChatByWorkspace[workspaceId],
            },
          }
        }),

      updateChatThread: (workspaceId, chatId, updates) =>
        set((state) => ({
          chatThreadsByWorkspace: {
            ...state.chatThreadsByWorkspace,
            [workspaceId]: normalizeList(
              (state.chatThreadsByWorkspace[workspaceId]?.items || []).map((chat) =>
                chat.id === chatId ? { ...chat, ...updates } : chat
              ),
              state.chatThreadsByWorkspace[workspaceId]
            ),
          },
        })),

      removeChatThread: (workspaceId, chatId) =>
        set((state) => {
          const existing = state.chatThreadsByWorkspace[workspaceId]?.items || []
          const remaining = existing.filter((chat) => chat.id !== chatId)
          const currentActive = state.activeChatByWorkspace[workspaceId]
          const nextActive = currentActive === chatId ? remaining[0]?.id || null : currentActive

          const messagesByChat = { ...state.messagesByChat }
          const messagesMetaByChat = { ...state.messagesMetaByChat }
          const citationsByChat = { ...state.citationsByChat }
          const verdictByChat = { ...state.verdictByChat }

          delete messagesByChat[chatId]
          delete messagesMetaByChat[chatId]
          delete citationsByChat[chatId]
          delete verdictByChat[chatId]

          return {
            chatThreadsByWorkspace: {
              ...state.chatThreadsByWorkspace,
              [workspaceId]: normalizeList(remaining, { loadedAt: Date.now() }),
            },
            activeChatByWorkspace: {
              ...state.activeChatByWorkspace,
              [workspaceId]: nextActive,
            },
            messagesByChat,
            messagesMetaByChat,
            citationsByChat,
            verdictByChat,
          }
        }),

      setActiveChatId: (workspaceId, chatId) =>
        set((state) => ({
          activeChatByWorkspace: {
            ...state.activeChatByWorkspace,
            [workspaceId]: chatId || null,
          },
          currentStage: null,
        })),

      setMessagesMeta: (chatId, meta) =>
        set((state) => ({
          messagesMetaByChat: {
            ...state.messagesMetaByChat,
            [chatId]: defaultMeta({ ...state.messagesMetaByChat[chatId], ...meta }),
          },
        })),

      setMessages: (chatId, messages, opts = {}) =>
        set((state) => {
          const existing = state.messagesByChat[chatId] || []
          const items = opts.append
            ? [...messages.filter((message) => !existing.some((item) => item.id === message.id)), ...existing]
            : Array.isArray(messages)
            ? messages
            : []

          return {
            messagesByChat: {
              ...state.messagesByChat,
              [chatId]: items,
            },
            messagesMetaByChat: {
              ...state.messagesMetaByChat,
              [chatId]: defaultMeta({
                ...state.messagesMetaByChat[chatId],
                loading: false,
                loadedAt: Date.now(),
                hasMore: opts.hasMore ?? false,
                nextOffset: opts.nextOffset ?? items.length,
              }),
            },
          }
        }),

      addMessage: (chatId, message) =>
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: [
              ...(state.messagesByChat[chatId] || []),
              {
                id: message.id || `${Date.now()}-${Math.random()}`,
                ...message,
              },
            ],
          },
        })),

      updateMessageById: (chatId, messageId, updates) =>
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: (state.messagesByChat[chatId] || []).map((message) =>
              message.id === messageId
                ? { ...message, ...(typeof updates === 'function' ? updates(message) : updates) }
                : message
            ),
          },
        })),

      clearMessagesForChat: (chatId) =>
        set((state) => ({
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: [],
          },
        })),

      setDocumentsMeta: (workspaceId, meta) =>
        set((state) => ({
          documentsMetaByWorkspace: {
            ...state.documentsMetaByWorkspace,
            [workspaceId]: { ...state.documentsMetaByWorkspace[workspaceId] || {}, ...meta },
          },
        })),

      setDocuments: (workspaceId, documents) =>
        set((state) => ({
          documentsByWorkspace: {
            ...state.documentsByWorkspace,
            [workspaceId]: Array.isArray(documents) ? documents : [],
          },
          documentsMetaByWorkspace: {
            ...state.documentsMetaByWorkspace,
            [workspaceId]: { ...state.documentsMetaByWorkspace[workspaceId] || {}, loadedAt: Date.now() },
          },
        })),

      addDocument: (workspaceId, document) =>
        set((state) => ({
          documentsByWorkspace: {
            ...state.documentsByWorkspace,
            [workspaceId]: [document, ...(state.documentsByWorkspace[workspaceId] || [])],
          },
        })),

      updateDocument: (workspaceId, documentId, updates) =>
        set((state) => ({
          documentsByWorkspace: {
            ...state.documentsByWorkspace,
            [workspaceId]: (state.documentsByWorkspace[workspaceId] || []).map((doc) =>
              (doc.doc_id || doc.id) === documentId ? { ...doc, ...updates } : doc
            ),
          },
        })),

      removeDocument: (workspaceId, documentId) =>
        set((state) => ({
          documentsByWorkspace: {
            ...state.documentsByWorkspace,
            [workspaceId]: (state.documentsByWorkspace[workspaceId] || []).filter(
              (doc) => (doc.doc_id || doc.id) !== documentId
            ),
          },
        })),

      setCitationsForChat: (chatId, citations) =>
        set((state) => ({
          citationsByChat: {
            ...state.citationsByChat,
            [chatId]: normalizeCitations(citations),
          },
        })),

      addCitationsForChat: (chatId, citations) =>
        set((state) => ({
          citationsByChat: {
            ...state.citationsByChat,
            [chatId]: normalizeCitations([
              ...(state.citationsByChat[chatId] || []),
              ...(citations || []),
            ]),
          },
        })),

      setVerdictForChat: (chatId, verdict) =>
        set((state) => ({
          verdictByChat: {
            ...state.verdictByChat,
            [chatId]: verdict || null,
          },
        })),

      setStreaming: (isStreaming) => set({ isStreaming }),
      setStage: (currentStage) => set({ currentStage }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setActiveMode: (activeMode) => set({ activeMode }),
      setSelectedPage: (selectedPage) => set({ selectedPage }),
      setWorkspaceSearch: (workspaceSearch) => set({ workspaceSearch }),
      setChatSearch: (chatSearch) => set({ chatSearch }),
      setReferencesQuery: (referencesQuery) => set({ referencesQuery }),
      setReferencesFilter: (referencesFilter) => set({ referencesFilter }),
      toggleReferencesSection: (section) =>
        set((state) => ({
          referencesCollapsedSections: {
            ...state.referencesCollapsedSections,
            [section]: !state.referencesCollapsedSections[section],
          },
        })),

      getActiveWorkspace: () => {
        const state = get()
        return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) || null
      },

      getActiveChatId: () => {
        const state = get()
        return state.activeWorkspaceId && state.activeChatByWorkspace[state.activeWorkspaceId]
          ? state.activeChatByWorkspace[state.activeWorkspaceId]
          : null
      },

      getChatThreads: (workspaceId) =>
        get().chatThreadsByWorkspace[workspaceId]?.items || [],

      getMessages: (chatId) => get().messagesByChat[chatId] || [],

      getDocuments: (workspaceId) => get().documentsByWorkspace[workspaceId] || [],

      getCitations: (chatId) => get().citationsByChat[chatId] || [],
    }),
    {
      name: 'lexai-store-v2',
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      partialize: (state) => ({
  session: state.session,
  profile: state.profile,

  workspaces: state.workspaces,
  workspacesLoadedAt: state.workspacesLoadedAt,
  activeWorkspaceId: state.activeWorkspaceId,

  activeChatByWorkspace: state.activeChatByWorkspace,

  chatThreadsByWorkspace: state.chatThreadsByWorkspace,
  chatThreadsMetaByWorkspace: state.chatThreadsMetaByWorkspace,

  messagesByChat: state.messagesByChat,
  messagesMetaByChat: state.messagesMetaByChat,

  documentsByWorkspace: state.documentsByWorkspace,
  documentsMetaByWorkspace: state.documentsMetaByWorkspace,

  citationsByChat: state.citationsByChat,
  verdictByChat: state.verdictByChat,

  sidebarCollapsed: state.sidebarCollapsed,
  mobileSidebarOpen: state.mobileSidebarOpen,
  rightPanelOpen: state.rightPanelOpen,

  selectedPage: state.selectedPage,
  activeMode: state.activeMode,

  workspaceSearch: state.workspaceSearch,
  chatSearch: state.chatSearch,

  referencesQuery: state.referencesQuery,
  referencesFilter: state.referencesFilter,
  referencesCollapsedSections:
    state.referencesCollapsedSections,
}),
      version: 2,
    }
  )
)
