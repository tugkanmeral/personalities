import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  Sparkles,
  Plus,
  Trash2,
  Send,
  Sliders,
  FileJson,
  FileText,
  Brain,
  CheckSquare,
  Square,
  Settings,
  Database,
  Cpu,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Copy,
  Layers,
  RotateCw,
  MessageSquare,
  Lock,
  Globe,
  Zap,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import {
  ArenaAskResponse,
  ChatMessage,
  ChatMessageTurnResponse,
  ChatSession,
  ChatTurnError,
  CustomFactor,
  FactorCatalog,
  PersonaCharacter,
  PersonaMemoryFact,
  SystemStatus,
} from './types';

const EMOJI_OPTIONS = ['🏍️', '🎀', '📰', '👩‍💻', '👨‍🔬', '🎨', '🧒', '👵', '🚀', '🎸', '📚', '💼'];

const DEFAULT_NEW_PERSONA: PersonaCharacter = {
  name: '',
  avatarEmoji: '🧑',
  summaryTagline: '',
  demographics: {
    age: 30,
    gender: 'Male',
    country: 'United States',
    city: 'Austin',
    growingUpEnvironment: 'Metropolitan / Urban Center',
    maritalStatus: 'Single',
  },
  socioEconomic: {
    childhoodFinancialStatus: 'Standard Middle Class (Balanced)',
    currentFinancialStatus: 'Financially Comfortable / Upper-Middle Income',
    educationLevel: "Bachelor's Degree",
    educationField: 'Computer / Software / Electrical Engineering',
    profession: 'Software Engineer',
    financialAttitude: 'Value-for-Money & Functionality Focused (Analytical Consumer)',
  },
  bigFive: {
    openness: 75,
    conscientiousness: 70,
    extraversion: 50,
    agreeableness: 60,
    neuroticism: 35,
  },
  valuesAndInterests: {
    interests: ['Embedded Systems & Technology'],
    dislikes: [],
    coreMotivation: 'Acquiring Knowledge, Technology, and Competence',
    decisionStyle: 'Analytical, Data-Driven, and Engineering-Minded',
    speechStyleNote: '',
  },
  customFactors: [],
};

const PRESET_QUESTIONS = [
  {
    label: '🏍️ News Preference (Football vs MotoGP vs Technology)',
    question:
      'Do you follow football news, MotoGP news, or technology news the most? What is your priority order?',
    options: ['Technology news', 'MotoGP news', 'Football news'],
  },
  {
    label: '🎀 Favorite Color',
    question: 'What is your favorite color and why do you like it?',
    options: [],
  },
  {
    label: '💰 $10,000 Windfall Decision',
    question:
      'If you unexpectedly received $10,000 to spend or allocate today, which of the following would you choose?',
    options: [
      'Buy high-end tech gear, computing hardware, or motorsport equipment',
      'Put it into a low-risk savings bond, index fund, or gold',
      'Spend it on fun, toys, games, or an immediate vacation',
    ],
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<'arena' | 'chat' | 'studio'>('arena');
  const [personas, setPersonas] = useState<PersonaCharacter[]>([]);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<FactorCatalog | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  // LLM Provider & Model State
  const [provider, setProvider] = useState<'Gemini' | 'Ollama'>('Ollama');
  const [geminiModel, setGeminiModel] = useState('gemini-3.5-flash');
  const [ollamaModel, setOllamaModel] = useState('hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M');
  const [apiKeyOverride, setApiKeyOverride] = useState<string>(
    () => localStorage.getItem('personalab_gemini_key') || ''
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Arena State
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState('');
  const [arenaLoading, setArenaLoading] = useState(false);
  const [retryingPersonaIds, setRetryingPersonaIds] = useState<string[]>([]);
  const [arenaResponse, setArenaResponse] = useState<ArenaAskResponse | null>(null);
  const [inspectedPersona, setInspectedPersona] = useState<PersonaCharacter | null>(null);

  // Chat State (1-on-1 & Group Chat + Memory & Privacy Inspector)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatSession, setActiveChatSession] = useState<ChatSession | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [compactingMemory, setCompactingMemory] = useState(false);
  const [targetResponderIds, setTargetResponderIds] = useState<string[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [showMemoryInspector, setShowMemoryInspector] = useState(true);
  const [recentMemoryBanner, setRecentMemoryBanner] = useState<PersonaMemoryFact[]>([]);
  const [chatToastWarnings, setChatToastWarnings] = useState<ChatTurnError[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Studio State
  const [editingPersona, setEditingPersona] = useState<PersonaCharacter>(DEFAULT_NEW_PERSONA);
  const [previewTab, setPreviewTab] = useState<'md' | 'json' | 'psych'>('md');
  const [interestInput, setInterestInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const [savingPersona, setSavingPersona] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [statusRes, catalogRes, personasRes, chatSessionsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/factors/catalog'),
        fetch('/api/personas'),
        fetch('/api/chat/sessions'),
      ]);

      if (statusRes.ok) {
        const st: SystemStatus = await statusRes.json();
        setStatus(st);
        if (st.defaultProvider === 'Gemini' || st.defaultProvider === 'Ollama') {
          setProvider(st.defaultProvider);
        }
        if (st.ollamaDefaultModel) setOllamaModel(st.ollamaDefaultModel);
        if (
          st.ollamaAvailableModels &&
          st.ollamaAvailableModels.length > 0 &&
          !st.ollamaAvailableModels.includes(st.ollamaDefaultModel)
        ) {
          setOllamaModel(st.ollamaAvailableModels[0]);
        }
        if (st.geminiDefaultModel) setGeminiModel(st.geminiDefaultModel);
      }

      if (catalogRes.ok) {
        setCatalog(await catalogRes.json());
      }

      if (personasRes.ok) {
        const list: PersonaCharacter[] = await personasRes.json();
        setPersonas(list);
        if (list.length > 0 && selectedPersonaIds.length === 0) {
          setSelectedPersonaIds(list.map((p) => p.id!));
          setEditingPersona(list[0]);
        }
      }

      if (chatSessionsRes.ok) {
        const sessions: ChatSession[] = await chatSessionsRes.json();
        setChatSessions(sessions);
        if (sessions.length > 0) {
          setActiveChatSession(sessions[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }

  // Live preview compilation (only active while in the Studio tab)
  useEffect(() => {
    if (activeTab !== 'studio') return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/personas/preview-compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingPersona),
        });
        if (res.ok) {
          const compiled: PersonaCharacter = await res.json();
          setEditingPersona((prev) => ({
            ...prev,
            synthesizedProfile: compiled.synthesizedProfile,
            compiledSystemPromptMd: compiled.compiledSystemPromptMd,
          }));
        }
      } catch {
        // ignore preview error
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    editingPersona.name,
    editingPersona.avatarEmoji,
    editingPersona.demographics,
    editingPersona.socioEconomic,
    editingPersona.bigFive,
    editingPersona.valuesAndInterests,
    editingPersona.customFactors,
  ]);

  function toggleSelectPersona(id: string) {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleAskArena(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!question.trim() || selectedPersonaIds.length === 0) return;

    setArenaLoading(true);
    try {
      const res = await fetch('/api/arena/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaIds: selectedPersonaIds,
          question,
          options,
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          apiKeyOverride: apiKeyOverride || undefined,
        }),
      });

      if (res.ok) {
        const data: ArenaAskResponse = await res.json();
        setArenaResponse(data);
      }
    } catch (err) {
      console.error('Arena request failed:', err);
    } finally {
      setArenaLoading(false);
    }
  }

  async function handleRetryPersona(personaId: string) {
    if (!arenaResponse) return;
    const activeQuestion = arenaResponse.question || question;
    const activeOptions = arenaResponse.options ?? options;
    if (!activeQuestion.trim()) return;

    setRetryingPersonaIds((prev) => (prev.includes(personaId) ? prev : [...prev, personaId]));
    try {
      const res = await fetch('/api/arena/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaIds: [personaId],
          question: activeQuestion,
          options: activeOptions,
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          apiKeyOverride: apiKeyOverride || undefined,
        }),
      });

      if (res.ok) {
        const data: ArenaAskResponse = await res.json();
        const updatedResult = data.results.find((r) => r.personaId === personaId) || data.results[0];
        if (updatedResult) {
          setArenaResponse((prev) =>
            prev
              ? {
                  ...prev,
                  results: prev.results.map((r) =>
                    r.personaId === personaId ? updatedResult : r
                  ),
                }
              : prev
          );
        }
      }
    } catch (err) {
      console.error('Failed to retry persona:', err);
    } finally {
      setRetryingPersonaIds((prev) => prev.filter((id) => id !== personaId));
    }
  }

  async function handleSavePersona() {
    if (!editingPersona.name.trim()) {
      alert('Please enter a name for the persona.');
      return;
    }

    setSavingPersona(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPersona),
      });

      if (res.ok) {
        const saved: PersonaCharacter = await res.json();
        setEditingPersona(saved);

        const listRes = await fetch('/api/personas');
        if (listRes.ok) {
          const list: PersonaCharacter[] = await listRes.json();
          setPersonas(list);
          if (saved.id && !selectedPersonaIds.includes(saved.id)) {
            setSelectedPersonaIds((prev) => [...prev, saved.id!]);
          }
        }
        setSaveMessage('Persona DNA and Markdown System Prompt saved successfully!');
        setTimeout(() => setSaveMessage(null), 3500);
      }
    } finally {
      setSavingPersona(false);
    }
  }

  async function handleDeletePersona(id: string) {
    const res = await fetch(`/api/personas/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const updated = personas.filter((p) => p.id !== id);
      setPersonas(updated);
      setSelectedPersonaIds((prev) => prev.filter((x) => x !== id));
    }
  }

  // ================= PERSONA CHAT (1-ON-1 & GROUP CHAT) HANDLERS =================

  async function handleStartChatSession(customPersonaIds?: string[]) {
    const ids = customPersonaIds && customPersonaIds.length > 0 ? customPersonaIds : selectedPersonaIds;
    if (ids.length === 0) {
      alert('Please select at least one persona from the left sidebar to start a chat.');
      return;
    }

    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaIds: ids }),
      });

      if (res.ok) {
        const created: ChatSession = await res.json();
        setChatSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
        setActiveChatSession(created);
        setTargetResponderIds([]);
        setReplyToMessage(null);
        setRecentMemoryBanner([]);
        setActiveTab('chat');
      }
    } catch (err) {
      console.error('Failed to start chat session:', err);
    }
  }

  async function handleSendChatMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeChatSession || chatSending) return;
    if (!chatInput.trim() && !replyToMessage) return;

    const messageContent = chatInput.trim();
    const previousReplyTarget = replyToMessage;
    const targetMsgId = replyToMessage?.id;
    setChatInput('');
    setReplyToMessage(null);
    setChatSending(true);
    setRecentMemoryBanner([]);
    setChatToastWarnings([]);

    try {
      const res = await fetch(`/api/chat/sessions/${activeChatSession.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent,
          replyToMessageId: targetMsgId,
          targetPersonaIds: targetResponderIds.length > 0 ? targetResponderIds : undefined,
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          apiKeyOverride: apiKeyOverride || undefined,
        }),
      });

      if (res.ok) {
        const data: ChatMessageTurnResponse = await res.json();
        setActiveChatSession(data.session);
        setChatSessions((prev) => [
          data.session,
          ...prev.filter((s) => s.id !== data.session.id),
        ]);

        if (data.errors && data.errors.length > 0) {
          setChatToastWarnings(data.errors);
          // If no persona succeeded, restore the user's draft so they can retry immediately
          if (!data.newMessages || data.newMessages.length === 0) {
            setChatInput(messageContent);
            setReplyToMessage(previousReplyTarget);
          }
        }

        if (data.newlyLearnedFacts && data.newlyLearnedFacts.length > 0) {
          setRecentMemoryBanner(data.newlyLearnedFacts);
          const personasRes = await fetch('/api/personas');
          if (personasRes.ok) {
            setPersonas(await personasRes.json());
          }
        }

        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      } else {
        setChatInput(messageContent);
        setReplyToMessage(previousReplyTarget);
        setChatToastWarnings([
          {
            personaId: 'system',
            personaName: 'LLM Service',
            avatarEmoji: '⚠️',
            provider,
            model: provider === 'Gemini' ? geminiModel : ollamaModel,
            errorMessage: `Request failed (HTTP ${res.status}). Please check your LLM provider settings.`,
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
      setChatInput(messageContent);
      setReplyToMessage(previousReplyTarget);
      setChatToastWarnings([
        {
          personaId: 'system',
          personaName: 'LLM Connection',
          avatarEmoji: '⚠️',
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          errorMessage: 'Could not reach backend server or LLM service.',
        },
      ]);
    } finally {
      setChatSending(false);
    }
  }

  async function handleTriggerPersonaReplyToMessage(
    targetMsg: ChatMessage,
    responderPersonaIds: string[]
  ) {
    if (!activeChatSession || chatSending || responderPersonaIds.length === 0) return;

    setChatSending(true);
    setRecentMemoryBanner([]);
    setChatToastWarnings([]);

    try {
      const res = await fetch(`/api/chat/sessions/${activeChatSession.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          replyToMessageId: targetMsg.id,
          targetPersonaIds: responderPersonaIds,
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          apiKeyOverride: apiKeyOverride || undefined,
        }),
      });

      if (res.ok) {
        const data: ChatMessageTurnResponse = await res.json();
        setActiveChatSession(data.session);
        setChatSessions((prev) => [
          data.session,
          ...prev.filter((s) => s.id !== data.session.id),
        ]);

        if (data.errors && data.errors.length > 0) {
          setChatToastWarnings(data.errors);
        }

        if (data.newlyLearnedFacts && data.newlyLearnedFacts.length > 0) {
          setRecentMemoryBanner(data.newlyLearnedFacts);
          const personasRes = await fetch('/api/personas');
          if (personasRes.ok) {
            setPersonas(await personasRes.json());
          }
        }

        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      }
    } catch (err) {
      console.error('Failed to trigger persona-to-persona reply:', err);
      setChatToastWarnings([
        {
          personaId: 'system',
          personaName: 'LLM Connection',
          avatarEmoji: '⚠️',
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          errorMessage: 'Could not reach backend server or LLM service.',
        },
      ]);
    } finally {
      setChatSending(false);
    }
  }

  async function handleCompactSession() {
    if (!activeChatSession || compactingMemory) return;
    setCompactingMemory(true);
    try {
      const res = await fetch(`/api/chat/sessions/${activeChatSession.id}/compact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: provider === 'Gemini' ? geminiModel : ollamaModel,
          apiKeyOverride: apiKeyOverride || undefined,
        }),
      });

      if (res.ok) {
        const updated: ChatSession = await res.json();
        setActiveChatSession(updated);
        setChatSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
      }
    } catch (err) {
      console.error('Failed to compact session memory:', err);
    } finally {
      setCompactingMemory(false);
    }
  }

  async function handleDeleteChatSession(sessionId: string) {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = chatSessions.filter((s) => s.id !== sessionId);
        setChatSessions(remaining);
        if (activeChatSession?.id === sessionId) {
          setActiveChatSession(remaining.length > 0 ? remaining[0] : null);
        }
      }
    } catch (err) {
      console.error('Failed to delete chat session:', err);
    }
  }

  async function handleDeletePersonaMemoryFact(personaId: string, factId: string) {
    try {
      const res = await fetch(`/api/personas/${personaId}/memories/${factId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPersonas((prev) =>
          prev.map((p) =>
            p.id === personaId
              ? {
                  ...p,
                  memoryFacts: (p.memoryFacts || []).filter((f) => f.id !== factId),
                }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Failed to delete persona memory fact:', err);
    }
  }

  function toggleTargetResponder(personaId: string) {
    setTargetResponderIds((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId]
    );
  }

  function handleAgeChange(newAge: number) {
    const isChild = newAge < 18;
    setEditingPersona((prev) => ({
      ...prev,
      demographics: {
        ...prev.demographics,
        age: newAge,
        maritalStatus: isChild ? 'Child / Single' : prev.demographics.maritalStatus,
      },
      socioEconomic: {
        ...prev.socioEconomic,
        currentFinancialStatus: isChild
          ? 'Dependent on Family (Child / Student)'
          : prev.socioEconomic.currentFinancialStatus,
        financialAttitude: isChild
          ? 'No Concept of Money Yet (Child)'
          : prev.socioEconomic.financialAttitude,
      },
    }));
  }

  function addCustomFactorFromTemplate(tplIndex: number) {
    if (!catalog) return;
    const tpl = catalog.extensibleFactorTemplates[tplIndex];
    if (!tpl) return;

    const newFactor: CustomFactor = {
      id: Math.random().toString(36).substring(2, 9),
      category: tpl.category,
      key: tpl.key,
      label: tpl.label,
      value: tpl.suggestedOptions[0] || '',
      influenceDescription: tpl.defaultInfluenceHint,
    };

    setEditingPersona((prev) => ({
      ...prev,
      customFactors: [...prev.customFactors, newFactor],
    }));
  }

  function addBlankCustomFactor() {
    const newFactor: CustomFactor = {
      id: Math.random().toString(36).substring(2, 9),
      category: 'Custom Factor',
      key: `custom_${Date.now()}`,
      label: '',
      value: '',
      influenceDescription: '',
    };
    setEditingPersona((prev) => ({
      ...prev,
      customFactors: [...prev.customFactors, newFactor],
    }));
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* TOP HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              PersonaLab
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Hybrid JSON + MD Engine
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Synthetic Persona Builder & Multi-Agent Decision Arena (.NET + MongoDB)
            </p>
          </div>
        </div>

        {/* CENTER: TAB SWITCHER */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('arena')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'arena'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Multi-Persona Arena
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'chat'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Persona Chat (1:1 & Group)
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'studio'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Persona Studio (DNA + MD)
          </button>
        </div>

        {/* RIGHT: STATUS & LLM ENGINE SELECTOR */}
        <div className="flex items-center gap-3">
          {/* MongoDB Status Badge */}
          <div
            title={
              status?.mongoConnected
                ? `Connected to MongoDB (${status.databaseName})`
                : 'Waiting for MongoDB connection; using local JSON fallback store'
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
              status?.mongoConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            {status?.mongoConnected ? 'MongoDB Active' : 'Local JSON Fallback'}
          </div>

          {/* LLM Provider Selector */}
          <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-1 text-xs">
            <button
              onClick={() => setProvider('Gemini')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                provider === 'Gemini'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Google Gemini
            </button>
            <button
              onClick={() => setProvider('Ollama')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                provider === 'Ollama'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Local Ollama
            </button>
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="LLM Model & API Key Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: PERSONA POOL */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-sm">Persona Pool ({personas.length})</span>
            </div>
            <button
              onClick={() => {
                setEditingPersona({
                  ...DEFAULT_NEW_PERSONA,
                  id: undefined,
                  name: 'New Persona',
                });
                setActiveTab('studio');
              }}
              className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New Persona
            </button>
          </div>

          {(activeTab === 'arena' || activeTab === 'chat') && (
            <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {activeTab === 'chat'
                    ? `Selected for Chat (${selectedPersonaIds.length}):`
                    : 'Selected for Arena:'}
                </span>
                <button
                  onClick={() =>
                    setSelectedPersonaIds(
                      selectedPersonaIds.length === personas.length
                        ? []
                        : personas.map((p) => p.id!)
                    )
                  }
                  className="text-indigo-400 hover:underline"
                >
                  {selectedPersonaIds.length === personas.length ? 'Clear All' : 'Select All'}
                </button>
              </div>

              {activeTab === 'chat' && (
                <button
                  onClick={() => handleStartChatSession()}
                  disabled={selectedPersonaIds.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white shadow transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {selectedPersonaIds.length <= 1
                    ? 'Start Private 1-on-1 Chat'
                    : `Start Group Chat (${selectedPersonaIds.length} Personas)`}
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {personas.map((p) => {
              const isSelected = p.id ? selectedPersonaIds.includes(p.id) : false;
              const isEditing = activeTab === 'studio' && editingPersona.id === p.id;
              const memoryCount = p.memoryFacts?.length || 0;
              const secretCount = (p.memoryFacts || []).filter((f) => f.isConfidential).length;

              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 transition cursor-pointer ${
                    isEditing
                      ? 'bg-indigo-950/50 border-indigo-500'
                      : isSelected && (activeTab === 'arena' || activeTab === 'chat')
                      ? 'bg-slate-900 border-indigo-500/50'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                  onClick={() => {
                    if ((activeTab === 'arena' || activeTab === 'chat') && p.id) {
                      toggleSelectPersona(p.id);
                    } else {
                      setEditingPersona(p);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {(activeTab === 'arena' || activeTab === 'chat') && (
                        <div className="text-indigo-400">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </div>
                      )}
                      <span className="text-2xl">{p.avatarEmoji}</span>
                      <div>
                        <h3 className="font-semibold text-sm text-slate-100">{p.name}</h3>
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {p.demographics.age}yo • {p.demographics.city}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {p.id && (
                        <button
                          onClick={() => handleStartChatSession([p.id!])}
                          title={`Start 1-on-1 Chat with ${p.name}`}
                          className="p-1.5 rounded-lg hover:bg-indigo-950/80 text-indigo-400 hover:text-indigo-200"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingPersona(p);
                          setActiveTab('studio');
                        }}
                        title="Edit Persona Factors"
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {p.id && (
                        <button
                          onClick={() => handleDeletePersona(p.id!)}
                          title="Delete Persona"
                          className="p-1.5 rounded-lg hover:bg-red-950/60 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-300 line-clamp-2">{p.summaryTagline}</p>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {memoryCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <Brain className="w-2.5 h-2.5" />
                        {memoryCount} {memoryCount === 1 ? 'Memory' : 'Memories'}
                        {secretCount > 0 && ` (${secretCount} 🔒)`}
                      </span>
                    )}
                    {p.valuesAndInterests.interests.slice(0, 2).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                    {p.customFactors.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                        +{p.customFactors.length} Custom
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* RIGHT MAIN AREA */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'arena' ? (
            /* ================= ARENA VIEW ================= */
            <div className="max-w-6xl mx-auto p-6 space-y-6">
              {/* Preset Scenario Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-400 mr-1">Sample Prompts:</span>
                {PRESET_QUESTIONS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setQuestion(preset.question);
                      setOptions(preset.options);
                    }}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Question & Options Form */}
              <form
                onSubmit={handleAskArena}
                className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Question or Scenario for Selected Personas
                  </label>
                  <textarea
                    rows={2}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g., Do you follow football news, MotoGP news, or technology news the most?"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Options (Optional) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Presented Options (Optional • Personas Will Rank Them by Priority)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {options.map((opt, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-200"
                      >
                        <strong className="text-indigo-400">{idx + 1}.</strong> {opt}
                        <button
                          type="button"
                          onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newOptionInput}
                      onChange={(e) => setNewOptionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newOptionInput.trim()) {
                            setOptions([...options, newOptionInput.trim()]);
                            setNewOptionInput('');
                          }
                        }
                      }}
                      placeholder="Add an option (e.g., Technology news) and press Enter..."
                      className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newOptionInput.trim()) {
                          setOptions([...options, newOptionInput.trim()]);
                          setNewOptionInput('');
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                    >
                      + Add Option
                    </button>
                    {options.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOptions([])}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs text-slate-400"
                      >
                        Clear Options
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    Active Engine:{' '}
                    <strong className="text-slate-200">
                      {provider} ({provider === 'Gemini' ? geminiModel : ollamaModel})
                    </strong>
                    <span>• Selected Personas: {selectedPersonaIds.length}</span>
                  </div>

                  <button
                    type="submit"
                    disabled={arenaLoading || selectedPersonaIds.length === 0}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition"
                  >
                    <Send className="w-4 h-4" />
                    {arenaLoading
                      ? 'Personas Thinking...'
                      : `Ask Selected Personas (${selectedPersonaIds.length})`}
                  </button>
                </div>
              </form>

              {/* RESULT CARDS */}
              {arenaResponse && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Persona Responses & Inner Monologue Analysis
                    </h2>
                    <span className="text-xs text-slate-500">
                      Question: "{arenaResponse.question}"
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {arenaResponse.results.map((res) => {
                      const fullPersona = personas.find((p) => p.id === res.personaId);
                      const isError = Boolean(
                        res.hasError ||
                          res.answer?.startsWith('[LLM Connection Error') ||
                          res.warningMessage?.includes('Error:')
                      );
                      const isRetrying = retryingPersonaIds.includes(res.personaId);

                      return (
                        <div
                          key={res.personaId}
                          className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg ${
                            isError ? 'border-amber-500/40' : 'border-slate-800'
                          }`}
                        >
                          <div className="space-y-4">
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
                              <div className="flex items-center gap-3">
                                <span className="text-3xl">{res.avatarEmoji}</span>
                                <div>
                                  <h3 className="font-bold text-slate-100">{res.personaName}</h3>
                                  <p className="text-xs text-slate-400">{res.summaryTagline}</p>
                                </div>
                              </div>
                              {fullPersona && (
                                <button
                                  onClick={() => setInspectedPersona(fullPersona)}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 shrink-0"
                                >
                                  View DNA / MD
                                </button>
                              )}
                            </div>

                            {/* First-Person Answer */}
                            <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-4">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">
                                Persona Response
                              </span>
                              <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">
                                "{res.answer}"
                              </p>
                            </div>

                            {/* Preference Ranking */}
                            {res.preferenceRanking && res.preferenceRanking.length > 0 && (
                              <div>
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                                  Preference & Priority Ranking
                                </span>
                                <div className="space-y-1.5">
                                  {res.preferenceRanking.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs ${
                                        idx === 0
                                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold'
                                          : idx === 1
                                          ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-200'
                                          : 'bg-slate-950 border border-slate-800 text-slate-400'
                                      }`}
                                    >
                                      <span className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center text-[11px] font-bold">
                                        {idx + 1}
                                      </span>
                                      <span>{item}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Inner Monologue */}
                            {res.innerMonologue && (
                              <div className="bg-purple-950/20 border border-purple-500/25 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5 mb-1">
                                  <Brain className="w-3.5 h-3.5" />
                                  Inner Monologue & Psychological Rationale
                                </span>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                  {res.innerMonologue}
                                </p>
                              </div>
                            )}

                            {/* Triggered Factors */}
                            {res.triggeredFactors && res.triggeredFactors.length > 0 && (
                              <div>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
                                  Triggered Persona Factors
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {res.triggeredFactors.map((tf, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300"
                                    >
                                      {tf}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Card Footer */}
                          <div className="pt-3 border-t border-slate-800/80 space-y-2">
                            {res.warningMessage && (
                              <div className="flex items-start gap-1.5 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span>{res.warningMessage}</span>
                              </div>
                            )}
                            {isError && (
                              <button
                                type="button"
                                onClick={() => handleRetryPersona(res.personaId)}
                                disabled={isRetrying}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 disabled:opacity-50 text-xs font-semibold text-amber-200 transition"
                              >
                                <RotateCw
                                  className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`}
                                />
                                {isRetrying ? 'Retrying Persona...' : 'Retry This Persona'}
                              </button>
                            )}
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>
                                {res.providerUsed} • {res.modelUsed}
                              </span>
                              <span>{res.durationMs} ms</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'chat' ? (
            /* ================= PERSONA CHAT VIEW (1-ON-1 & GROUP + MEMORY INSPECTOR) ================= */
            <div className="h-[calc(100vh-4.25rem)] flex overflow-hidden">
              {/* 1. CHAT SESSIONS LIST COLUMN */}
              <div className="w-72 border-r border-slate-800 bg-slate-900/30 flex flex-col shrink-0">
                <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                      Chat Sessions ({chatSessions.length})
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      1-on-1 & Group Conversations
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartChatSession()}
                    disabled={selectedPersonaIds.length === 0}
                    title="Start new chat with selected personas from left pool"
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {selectedPersonaIds.length > 1
                      ? `Group (${selectedPersonaIds.length})`
                      : 'New 1:1'}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {chatSessions.length === 0 ? (
                    <div className="text-center py-10 px-3 text-xs text-slate-500 space-y-2">
                      <MessageSquare className="w-7 h-7 mx-auto text-slate-700" />
                      <p>
                        No chat sessions yet. Select 1 persona on the left for a private 1-on-1 chat, or 2+ personas for a Group Chat.
                      </p>
                    </div>
                  ) : (
                    chatSessions.map((sess) => {
                      const isActive = activeChatSession?.id === sess.id;
                      return (
                        <div
                          key={sess.id}
                          onClick={() => {
                            setActiveChatSession(sess);
                            setTargetResponderIds([]);
                            setRecentMemoryBanner([]);
                          }}
                          className={`rounded-xl border p-3 cursor-pointer transition ${
                            isActive
                              ? 'bg-indigo-950/60 border-indigo-500/80 shadow'
                              : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="flex -space-x-1">
                                {sess.participants.map((part) => (
                                  <span
                                    key={part.personaId}
                                    className="text-lg inline-block"
                                    title={part.name}
                                  >
                                    {part.avatarEmoji}
                                  </span>
                                ))}
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  sess.isGroupChat
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {sess.isGroupChat
                                  ? `Group (${sess.participants.length})`
                                  : '1-on-1'}
                              </span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteChatSession(sess.id);
                              }}
                              title="Delete Chat Session"
                              className="p-1 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <h4 className="text-xs font-semibold text-slate-200 mt-1.5 line-clamp-1">
                            {sess.title}
                          </h4>

                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {sess.participants.map((p) => p.name).join(', ')}
                          </p>

                          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                            <span>
                              {sess.messages.length} msgs •{' '}
                              <strong className="text-slate-300">
                                {(sess.contextMetrics?.sessionTotalTokensSpent || 0).toLocaleString()} tok spent
                              </strong>
                            </span>
                            {sess.contextMetrics?.savedPercentage > 0 && (
                              <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                                <Zap className="w-2.5 h-2.5" />
                                -{sess.contextMetrics.savedPercentage}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. CENTER CONVERSATION STREAM & COMPOSER */}
              <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
                {!activeChatSession ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-100">
                      Start a 1-on-1 or Group Persona Conversation
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Select <strong>1 persona</strong> in the left Persona Pool for a private 1-on-1 conversation (where secrets you confide are stored as{' '}
                      <span className="text-amber-300 font-medium">🔒 Confidential 1:1 Memories</span>), or select{' '}
                      <strong>multiple personas</strong> for a Group Chat where personas remember their past 1-on-1 memories with you without betraying your private secrets to other group members.
                    </p>
                    <button
                      onClick={() => handleStartChatSession()}
                      disabled={selectedPersonaIds.length === 0}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {selectedPersonaIds.length <= 1
                        ? 'Start 1-on-1 Chat with Selected Persona'
                        : `Start Group Chat with ${selectedPersonaIds.length} Selected Personas`}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Chat Room Top Header */}
                    <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-1.5">
                          {activeChatSession.participants.map((p) => (
                            <span
                              key={p.personaId}
                              className="text-2xl inline-block"
                              title={p.name}
                            >
                              {p.avatarEmoji}
                            </span>
                          ))}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-100">
                              {activeChatSession.title}
                            </h3>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                                activeChatSession.isGroupChat
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {activeChatSession.isGroupChat ? (
                                <>
                                  <ShieldCheck className="w-3 h-3" />
                                  Group Room • 1:1 Secrets Protected
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  Private 1-on-1 Room
                                </>
                              )}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Participants:{' '}
                            {activeChatSession.participants.map((p) => p.name).join(', ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Cumulative Session Token Spend + Live Optimization Badge */}
                        <div
                          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] flex items-center gap-2.5"
                          title="Cumulative tokens spent in this chat session & active context window optimization"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-slate-300">
                            Chat Spent:{' '}
                            <strong className="text-amber-300">
                              {(activeChatSession.contextMetrics?.sessionTotalTokensSpent || 0).toLocaleString()} tok
                            </strong>
                          </span>
                          <span className="text-slate-700">|</span>
                          <span className="text-slate-400">
                            Next Window: <strong>~{activeChatSession.contextMetrics?.estimatedPromptTokens || 0}</strong> tok
                          </span>
                          {activeChatSession.contextMetrics?.savedPercentage > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                              -{activeChatSession.contextMetrics.savedPercentage}% saved
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => setShowMemoryInspector((prev) => !prev)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                            showMemoryInspector
                              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Brain className="w-3.5 h-3.5" />
                          Memory & Vaults
                        </button>
                      </div>
                    </div>

                    {/* Newly Learned Memory Notification Banner */}
                    {recentMemoryBanner.length > 0 && (
                      <div className="px-5 py-2 bg-indigo-950/60 border-b border-indigo-500/30 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-indigo-200 flex-wrap">
                          <Brain className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="font-semibold">New Persona Memory Stored:</span>
                          {recentMemoryBanner.map((fact) => (
                            <span
                              key={fact.id}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${
                                fact.isConfidential
                                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200'
                                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                              }`}
                            >
                              {fact.isConfidential ? (
                                <Lock className="w-3 h-3 text-amber-300" />
                              ) : (
                                <Globe className="w-3 h-3 text-emerald-300" />
                              )}
                              {fact.fact}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setRecentMemoryBanner([])}
                          className="text-slate-400 hover:text-white text-xs"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Messages Scroll Stream */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {/* Rolling Summary Banner at the top of the stream when older turns were compacted */}
                      {activeChatSession.rollingSummary && (
                        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-2xl p-3.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <Archive className="w-3.5 h-3.5" />
                              Compressed Early Conversation Memory ({activeChatSession.summarizedUpToIndex} earlier messages compacted)
                            </span>
                            <span className="text-[10px] text-emerald-400">
                              Active in LLM Context
                            </span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            {activeChatSession.rollingSummary}
                          </p>
                        </div>
                      )}

                      {activeChatSession.messages.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                          <p className="text-sm text-slate-300 font-medium">
                            Say hello to {activeChatSession.participants.map((p) => p.name).join(' & ')}!
                          </p>
                          <p>
                            {activeChatSession.isGroupChat
                              ? 'In Group Chat mode, personas remember what they learned about you in past 1-on-1 chats, while keeping your 1-on-1 secrets strictly confidential from other personas.'
                              : 'Anything you share in this 1-on-1 chat will be remembered by this persona across future 1-on-1 and Group chats.'}
                          </p>
                        </div>
                      ) : (
                        activeChatSession.messages
                          .filter(
                            (m) =>
                              !m.hasError &&
                              !m.content?.startsWith('[LLM Connection Error')
                          )
                          .map((msg, idx) => {
                          const isUser = msg.role === 'user';
                          const isCompacted = idx < activeChatSession.summarizedUpToIndex;
                          const fullPersona = personas.find((p) => p.id === msg.personaId);

                          if (isUser) {
                            const isSelectedTarget = replyToMessage?.id === msg.id;
                            return (
                              <div key={msg.id} className="flex justify-end">
                                <div
                                  className={`max-w-xl bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-md space-y-1.5 border ${
                                    isSelectedTarget ? 'border-amber-300 ring-2 ring-amber-400/40' : 'border-transparent'
                                  }`}
                                >
                                  {msg.replyToSenderName && (
                                    <div className="text-[11px] bg-indigo-900/60 border-l-2 border-indigo-300 rounded px-2.5 py-1 text-indigo-100">
                                      <span className="font-bold">↩ Replying to {msg.replyToSenderName}:</span>{' '}
                                      <span className="italic opacity-90">"{msg.replyToContentPreview}"</span>
                                    </div>
                                  )}
                                  <p className="text-sm leading-relaxed whitespace-pre-line">
                                    {msg.content}
                                  </p>
                                  <div className="flex items-center justify-between gap-3 pt-1 text-[10px] text-indigo-200/80">
                                    <button
                                      type="button"
                                      onClick={() => setReplyToMessage(msg)}
                                      className="hover:text-white underline"
                                      title="Select this message to have a specific persona reply to it"
                                    >
                                      ↩ Select to Reply
                                    </button>
                                    <div className="flex items-center gap-2">
                                      {isCompacted && (
                                        <span title="Folded into Rolling Summary to save tokens">
                                          📦 Summarized
                                        </span>
                                      )}
                                      <span>
                                        {msg.totalTokens || msg.estimatedTokens || 0} tok
                                      </span>
                                      <span>• You</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const msgTotalTok =
                            msg.totalTokens ||
                            (msg.promptTokens || 0) + (msg.completionTokens || msg.estimatedTokens || 0);
                          const msgPromptTok = msg.promptTokens || 0;
                          const msgCompletionTok = msg.completionTokens || msg.estimatedTokens || 0;
                          const isSelectedTarget = replyToMessage?.id === msg.id;
                          const otherRoomParticipants = activeChatSession.participants.filter(
                            (p) => p.personaId !== msg.personaId
                          );

                          return (
                            <div key={msg.id} className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => fullPersona && setInspectedPersona(fullPersona)}
                                title="Click to inspect Persona DNA & System Prompt"
                                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0 hover:border-indigo-500/50 transition"
                              >
                                {msg.avatarEmoji || '🧑'}
                              </button>
                              <div
                                className={`max-w-2xl bg-slate-900/90 border rounded-2xl rounded-tl-sm px-4 py-3 shadow-md space-y-2 ${
                                  isSelectedTarget
                                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                                    : 'border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-xs font-bold text-indigo-300">
                                    {msg.personaName || 'Persona'}
                                  </span>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    {isCompacted && (
                                      <span
                                        className="text-indigo-400/80"
                                        title="Folded into Rolling Summary to save tokens"
                                      >
                                        📦 Summarized
                                      </span>
                                    )}
                                    {msgTotalTok > 0 && (
                                      <span
                                        className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300/90 font-medium"
                                        title={`Tokens spent for this message: ${msgPromptTok} prompt (in) + ${msgCompletionTok} completion (out) = ${msgTotalTok} total`}
                                      >
                                        ⚡ {msgTotalTok} tok ({msgPromptTok} in / {msgCompletionTok} out)
                                      </span>
                                    )}
                                    {msg.durationMs ? <span>{msg.durationMs} ms</span> : null}
                                  </div>
                                </div>

                                {msg.replyToSenderName && (
                                  <div className="text-[11px] bg-slate-950/90 border-l-2 border-purple-400 rounded px-2.5 py-1.5 text-slate-300">
                                    <span className="font-bold text-purple-300">
                                      ↩ Replying to {msg.replyToSenderName}:
                                    </span>{' '}
                                    <span className="italic text-slate-400">
                                      "{msg.replyToContentPreview}"
                                    </span>
                                  </div>
                                )}

                                <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">
                                  {msg.content}
                                </p>

                                {msg.extractedMemoryFact && (
                                  <div
                                    className={`text-[11px] rounded-lg px-2.5 py-1.5 border flex items-center gap-1.5 ${
                                      msg.extractedMemoryFact.isConfidential
                                        ? 'bg-amber-950/30 border-amber-500/35 text-amber-200'
                                        : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                                    }`}
                                  >
                                    {msg.extractedMemoryFact.isConfidential ? (
                                      <Lock className="w-3 h-3 text-amber-300 shrink-0" />
                                    ) : (
                                      <Globe className="w-3 h-3 text-emerald-300 shrink-0" />
                                    )}
                                    <span>
                                      <strong>
                                        {msg.extractedMemoryFact.isConfidential
                                          ? 'Confidential 1:1 Memory Saved:'
                                          : 'Memory Saved:'}
                                      </strong>{' '}
                                      {msg.extractedMemoryFact.fact}
                                    </span>
                                  </div>
                                )}

                                {msg.warningMessage && (
                                  <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                                    {msg.warningMessage}
                                  </div>
                                )}

                                {/* Direct Persona-to-Persona & Target Reply Action Bar */}
                                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyToMessage(msg);
                                      if (
                                        otherRoomParticipants.length > 0 &&
                                        targetResponderIds.length === 0
                                      ) {
                                        setTargetResponderIds([otherRoomParticipants[0].personaId]);
                                      }
                                    }}
                                    className="text-[11px] px-2 py-0.5 rounded-md bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                                    title="Quote/select this message in the composer below and choose who replies"
                                  >
                                    ↩ Select to Reply
                                  </button>

                                  {otherRoomParticipants.map((other) => (
                                    <button
                                      key={other.personaId}
                                      type="button"
                                      disabled={chatSending}
                                      onClick={() =>
                                        handleTriggerPersonaReplyToMessage(msg, [other.personaId])
                                      }
                                      className="text-[11px] px-2.5 py-0.5 rounded-md bg-purple-950/50 hover:bg-purple-900/70 disabled:opacity-40 text-purple-200 border border-purple-500/35 flex items-center gap-1 transition"
                                      title={`Have ${other.name} directly reply to ${msg.personaName}'s message`}
                                    >
                                      <span>↩ Have {other.avatarEmoji}</span>
                                      <strong>{other.name}</strong>
                                      <span>reply</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Message Composer Footer */}
                    <form
                      onSubmit={handleSendChatMessage}
                      className="p-4 border-t border-slate-800 bg-slate-900/80 space-y-2.5"
                    >
                      {/* Selected Target Message Banner (Reply-To Selector) */}
                      {replyToMessage && (
                        <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-purple-950/50 border border-purple-500/40 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-purple-300 shrink-0">
                              ↩ Replying to{' '}
                              {replyToMessage.role === 'user'
                                ? 'Your Message'
                                : replyToMessage.personaName}
                              :
                            </span>
                            <span className="text-slate-300 truncate italic">
                              "{replyToMessage.content}"
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyToMessage(null)}
                            className="text-slate-400 hover:text-white px-1.5 font-bold"
                            title="Cancel target message selection"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      {/* Group Chat Target Responder Selector */}
                      {(activeChatSession.isGroupChat || replyToMessage) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] text-slate-400 mr-1">
                            Who replies in this turn:
                          </span>
                          <button
                            type="button"
                            onClick={() => setTargetResponderIds([])}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                              targetResponderIds.length === 0
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                            }`}
                          >
                            All Participants ({activeChatSession.participants.length})
                          </button>
                          {activeChatSession.participants.map((part) => {
                            const selected = targetResponderIds.includes(part.personaId);
                            return (
                              <button
                                key={part.personaId}
                                type="button"
                                onClick={() => toggleTargetResponder(part.personaId)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition ${
                                  selected
                                    ? 'bg-purple-600 text-white border-purple-500'
                                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <span>{part.avatarEmoji}</span>
                                <span>@{part.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex gap-2.5">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={chatSending}
                          placeholder={
                            replyToMessage
                              ? `Add a comment, or leave blank & click button to let selected persona(s) reply directly to ${
                                  replyToMessage.role === 'user'
                                    ? 'you'
                                    : replyToMessage.personaName
                                }...`
                              : activeChatSession.isGroupChat
                              ? `Message ${activeChatSession.participants.map((p) => p.name).join(', ')}...`
                              : `Message ${activeChatSession.participants[0]?.name || 'Persona'}...`
                          }
                          className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={chatSending || (!chatInput.trim() && !replyToMessage)}
                          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition shrink-0"
                        >
                          <Send className="w-4 h-4" />
                          {chatSending
                            ? 'Replying...'
                            : !chatInput.trim() && replyToMessage
                            ? `Let ${
                                targetResponderIds.length > 0
                                  ? activeChatSession.participants
                                      .filter((p) => targetResponderIds.includes(p.personaId))
                                      .map((p) => p.name)
                                      .join(', ')
                                  : 'Persona(s)'
                              } Reply`
                            : 'Send'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>

              {/* 3. RIGHT MEMORY, TOKEN OPTIMIZATION & PRIVACY INSPECTOR DRAWER */}
              {activeChatSession && showMemoryInspector && (
                <div className="w-80 xl:w-96 border-l border-slate-800 bg-slate-900/50 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                        <Brain className="w-4 h-4" />
                        Memory & Privacy Vault
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Cross-Session Recall & Token Optimization
                      </p>
                    </div>
                  </div>

                  {/* Card 1: Token Consumption & Sliding Window Telemetry */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" />
                        Token Usage & Optimization
                      </span>
                      {activeChatSession.contextMetrics?.savedPercentage > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">
                          {activeChatSession.contextMetrics.savedPercentage}% Saved
                        </span>
                      )}
                    </div>

                    {/* Cumulative Token Expenditure in This Chat */}
                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-amber-500/25 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-medium">Total Spent in This Chat</span>
                        <strong className="text-amber-300 text-sm">
                          {(activeChatSession.contextMetrics?.sessionTotalTokensSpent || 0).toLocaleString()} tok
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          Input (Prompt):{' '}
                          <strong className="text-slate-200">
                            {(activeChatSession.contextMetrics?.sessionPromptTokensSpent || 0).toLocaleString()}
                          </strong>
                        </span>
                        <span>
                          Output (Reply):{' '}
                          <strong className="text-slate-200">
                            {(activeChatSession.contextMetrics?.sessionCompletionTokensSpent || 0).toLocaleString()}
                          </strong>
                        </span>
                      </div>
                      {(activeChatSession.compactionTokensSpent || 0) > 0 && (
                        <div className="text-[10px] text-indigo-300/90 flex justify-between pt-0.5 border-t border-slate-800">
                          <span>Summary Compaction Overhead:</span>
                          <strong>{activeChatSession.compactionTokensSpent} tok</strong>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 block">Active Window Prompt</span>
                        <strong className="text-slate-100 text-sm">
                          ~{activeChatSession.contextMetrics?.estimatedPromptTokens || 0} tok
                        </strong>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 block">Uncompressed Raw</span>
                        <strong className="text-slate-400 line-through text-sm">
                          ~{activeChatSession.contextMetrics?.rawUncompressedTokens || 0} tok
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>
                        Sliding Window: <strong>{activeChatSession.contextMetrics?.activeWindowCount || 0}</strong>/8 msgs
                      </span>
                      <span>
                        Compacted: <strong>{activeChatSession.summarizedUpToIndex}</strong> msgs
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCompactSession}
                      disabled={
                        compactingMemory ||
                        activeChatSession.messages.length - activeChatSession.summarizedUpToIndex <= 2
                      }
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium text-[11px] flex items-center justify-center gap-1.5 transition"
                    >
                      <Archive className="w-3.5 h-3.5 text-indigo-400" />
                      {compactingMemory
                        ? 'Compacting Early Turns...'
                        : 'Compact Session Memory Now'}
                    </button>
                  </div>

                  {/* Card 2: Session Rolling Summary */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <span className="font-bold text-indigo-300 block">
                      Session Rolling Summary (Early Turns)
                    </span>
                    {activeChatSession.rollingSummary ? (
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {activeChatSession.rollingSummary}
                      </p>
                    ) : (
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        Older turns automatically compress into this rolling summary once the conversation exceeds 12 messages (or click "Compact Session Memory Now" above).
                      </p>
                    )}
                  </div>

                  {/* Card 3: Each Participating Persona's Cross-Session Memory Vault */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        Persona Memory Vaults (Cross-Session)
                      </span>
                    </div>

                    {activeChatSession.participants.map((part) => {
                      const fullPersona = personas.find((p) => p.id === part.personaId);
                      const facts = fullPersona?.memoryFacts || [];

                      return (
                        <div
                          key={part.personaId}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{part.avatarEmoji}</span>
                              <div>
                                <h4 className="font-bold text-slate-100">{part.name}</h4>
                                <span className="text-[10px] text-slate-400">
                                  {facts.length} stored {facts.length === 1 ? 'memory' : 'memories'}
                                </span>
                              </div>
                            </div>
                            {activeChatSession.isGroupChat && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                title="Other personas in this group cannot see this vault"
                              >
                                Isolated Vault
                              </span>
                            )}
                          </div>

                          {facts.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              No persistent facts stored for {part.name} yet. Share a personal detail or secret in chat!
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {facts.map((f) => (
                                <div
                                  key={f.id}
                                  className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                                    f.isConfidential
                                      ? 'bg-amber-950/25 border-amber-500/40 text-amber-100'
                                      : 'bg-slate-900 border-slate-800 text-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${
                                        f.isConfidential ? 'text-amber-300' : 'text-emerald-300'
                                      }`}
                                    >
                                      {f.isConfidential ? (
                                        <>
                                          <Lock className="w-3 h-3" />
                                          Confidential 1:1 Secret
                                        </>
                                      ) : (
                                        <>
                                          <Globe className="w-3 h-3" />
                                          General Memory ({f.sourceMode})
                                        </>
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeletePersonaMemoryFact(part.personaId, f.id)
                                      }
                                      title="Forget this memory"
                                      className="text-slate-500 hover:text-red-400"
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <p className="leading-relaxed">{f.fact}</p>
                                  {f.isConfidential && activeChatSession.isGroupChat && (
                                    <p className="text-[10px] text-amber-300/80 italic">
                                      Protected: {part.name} remembers this internally but will never reveal it to other group members.
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================= PERSONA STUDIO (BUILDER + JSON/MD) ================= */
            <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT 7 COLUMNS: FACTOR BUILDER FORM */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">
                      Persona Factors & Developmental Tree
                    </h2>
                    <p className="text-xs text-slate-400">
                      All demographic, financial, and psychological factors compile into the System Prompt on the right in real time.
                    </p>
                  </div>
                  <button
                    onClick={handleSavePersona}
                    disabled={savingPersona}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/20 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {savingPersona ? 'Saving...' : 'Save Persona'}
                  </button>
                </div>

                {saveMessage && (
                  <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-xl text-xs font-medium">
                    {saveMessage}
                  </div>
                )}

                {/* 1. CORE DEMOGRAPHICS */}
                <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                    1. Core Demographics
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">Persona Name</label>
                      <input
                        type="text"
                        value={editingPersona.name}
                        onChange={(e) =>
                          setEditingPersona({ ...editingPersona, name: e.target.value })
                        }
                        placeholder="e.g., Ethan Carter"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Avatar Emoji</label>
                      <div className="flex flex-wrap gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1.5">
                        {EMOJI_OPTIONS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setEditingPersona({ ...editingPersona, avatarEmoji: em })}
                            className={`text-lg p-1 rounded-lg ${
                              editingPersona.avatarEmoji === em
                                ? 'bg-indigo-600'
                                : 'hover:bg-slate-800'
                            }`}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Age</span>
                        <strong className="text-indigo-300">
                          {editingPersona.demographics.age} years old
                        </strong>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={85}
                        value={editingPersona.demographics.age}
                        onChange={(e) => handleAgeChange(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>4 (Child)</span>
                        <span>35 (Adult)</span>
                        <span>85 (Senior)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Gender</label>
                      <select
                        value={editingPersona.demographics.gender}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            demographics: { ...editingPersona.demographics, gender: e.target.value },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.genders || ['Female', 'Male', 'Unspecified']).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Marital Status</label>
                      <select
                        value={editingPersona.demographics.maritalStatus}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            demographics: {
                              ...editingPersona.demographics,
                              maritalStatus: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.maritalStatuses || ['Single', 'Married']).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Country</label>
                      <input
                        type="text"
                        value={editingPersona.demographics.country}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            demographics: {
                              ...editingPersona.demographics,
                              country: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">City</label>
                      <input
                        type="text"
                        value={editingPersona.demographics.city}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            demographics: { ...editingPersona.demographics, city: e.target.value },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Growing Up Environment
                      </label>
                      <select
                        value={editingPersona.demographics.growingUpEnvironment}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            demographics: {
                              ...editingPersona.demographics,
                              growingUpEnvironment: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.growingUpEnvironments || ['Metropolitan / Urban Center']).map(
                          (env) => (
                            <option key={env} value={env}>
                              {env}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                </section>

                {/* 2. SOCIO-ECONOMIC & FINANCIAL HISTORY */}
                <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                    2. Education, Occupation & Financial Trajectory
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Childhood / Pre-Adulthood Financial Status (Ages 0-18)
                      </label>
                      <select
                        value={editingPersona.socioEconomic.childhoodFinancialStatus}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              childhoodFinancialStatus: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.childhoodFinancialStatuses || []).map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Adulthood / Current Financial Status
                      </label>
                      <select
                        value={editingPersona.socioEconomic.currentFinancialStatus}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              currentFinancialStatus: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.currentFinancialStatuses || []).map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Education Level</label>
                      <select
                        value={editingPersona.socioEconomic.educationLevel}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              educationLevel: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.educationLevels || []).map((ed) => (
                          <option key={ed} value={ed}>
                            {ed}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Field of Study / Specialization
                      </label>
                      <select
                        value={editingPersona.socioEconomic.educationField}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              educationField: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.educationFields || []).map((ef) => (
                          <option key={ef} value={ef}>
                            {ef}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Profession / Daily Occupation
                      </label>
                      <input
                        type="text"
                        value={editingPersona.socioEconomic.profession}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              profession: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g., Senior Embedded Systems Engineer"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Financial & Consumer Attitude
                      </label>
                      <select
                        value={editingPersona.socioEconomic.financialAttitude}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            socioEconomic: {
                              ...editingPersona.socioEconomic,
                              financialAttitude: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.financialAttitudes || []).map((fa) => (
                          <option key={fa} value={fa}>
                            {fa}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* 3. BIG-FIVE PERSONALITY SLIDERS */}
                <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                    3. Big-Five Personality Sliders (0-100)
                  </h3>

                  {[
                    {
                      key: 'openness' as const,
                      label: 'Openness to Experience',
                      low: 'Conventional / Routine-Oriented',
                      high: 'Curious / Innovative / Tech-Forward',
                    },
                    {
                      key: 'conscientiousness' as const,
                      label: 'Conscientiousness (Self-Discipline & Analytical Rigor)',
                      low: 'Spontaneous / Impulse-Driven',
                      high: 'Organized / Analytical / Detail-Oriented',
                    },
                    {
                      key: 'extraversion' as const,
                      label: 'Extraversion',
                      low: 'Introverted / Solitary Focus',
                      high: 'Sociable / Expressive / Energetic',
                    },
                    {
                      key: 'agreeableness' as const,
                      label: 'Agreeableness (Empathy & Cooperation)',
                      low: 'Competitive / Skeptical / Direct',
                      high: 'Cooperative / Warm / Empathetic',
                    },
                    {
                      key: 'neuroticism' as const,
                      label: 'Neuroticism (Emotional Sensitivity & Anxiety)',
                      low: 'Calm / Resilient Under Stress',
                      high: 'Anxious / Emotionally Reactive',
                    },
                  ].map((trait) => (
                    <div key={trait.key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-200">{trait.label}</span>
                        <span className="font-bold text-indigo-400">
                          {editingPersona.bigFive[trait.key]} / 100
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={editingPersona.bigFive[trait.key]}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            bigFive: {
                              ...editingPersona.bigFive,
                              [trait.key]: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>0: {trait.low}</span>
                        <span>100: {trait.high}</span>
                      </div>
                    </div>
                  ))}
                </section>

                {/* 4. INTERESTS & DECISION STYLE */}
                <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">
                    4. Interests, Values & Speech Style
                  </h3>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">
                      Interests & Passions (Click Presets or Type Custom)
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editingPersona.valuesAndInterests.interests.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-xs text-indigo-200"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() =>
                              setEditingPersona({
                                ...editingPersona,
                                valuesAndInterests: {
                                  ...editingPersona.valuesAndInterests,
                                  interests: editingPersona.valuesAndInterests.interests.filter(
                                    (_, idx) => idx !== i
                                  ),
                                },
                              })
                            }
                            className="hover:text-red-400"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {(catalog?.suggestedInterests || []).map((sug) => {
                        const active = editingPersona.valuesAndInterests.interests.includes(sug);
                        if (active) return null;
                        return (
                          <button
                            key={sug}
                            type="button"
                            onClick={() =>
                              setEditingPersona({
                                ...editingPersona,
                                valuesAndInterests: {
                                  ...editingPersona.valuesAndInterests,
                                  interests: [...editingPersona.valuesAndInterests.interests, sug],
                                },
                              })
                            }
                            className="text-[11px] px-2 py-0.5 rounded-md bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800"
                          >
                            + {sug}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={interestInput}
                        onChange={(e) => setInterestInput(e.target.value)}
                        placeholder="Add custom interest..."
                        className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (interestInput.trim()) {
                            setEditingPersona({
                              ...editingPersona,
                              valuesAndInterests: {
                                ...editingPersona.valuesAndInterests,
                                interests: [
                                  ...editingPersona.valuesAndInterests.interests,
                                  interestInput.trim(),
                                ],
                              },
                            });
                            setInterestInput('');
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Dislikes */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Disliked / Avoided Topics
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editingPersona.valuesAndInterests.dislikes.map((d, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/50 border border-red-500/30 text-xs text-red-200"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() =>
                              setEditingPersona({
                                ...editingPersona,
                                valuesAndInterests: {
                                  ...editingPersona.valuesAndInterests,
                                  dislikes: editingPersona.valuesAndInterests.dislikes.filter(
                                    (_, idx) => idx !== i
                                  ),
                                },
                              })
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={dislikeInput}
                        onChange={(e) => setDislikeInput(e.target.value)}
                        placeholder="e.g., Celebrity Gossip, Speculative Crypto..."
                        className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (dislikeInput.trim()) {
                            setEditingPersona({
                              ...editingPersona,
                              valuesAndInterests: {
                                ...editingPersona.valuesAndInterests,
                                dislikes: [
                                  ...editingPersona.valuesAndInterests.dislikes,
                                  dislikeInput.trim(),
                                ],
                              },
                            });
                            setDislikeInput('');
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Core Life Motivation
                      </label>
                      <select
                        value={editingPersona.valuesAndInterests.coreMotivation}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            valuesAndInterests: {
                              ...editingPersona.valuesAndInterests,
                              coreMotivation: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.coreMotivations || []).map((cm) => (
                          <option key={cm} value={cm}>
                            {cm}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Decision-Making Style
                      </label>
                      <select
                        value={editingPersona.valuesAndInterests.decisionStyle}
                        onChange={(e) =>
                          setEditingPersona({
                            ...editingPersona,
                            valuesAndInterests: {
                              ...editingPersona.valuesAndInterests,
                              decisionStyle: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                      >
                        {(catalog?.decisionStyles || []).map((ds) => (
                          <option key={ds} value={ds}>
                            {ds}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* 5. EXTENSIBLE CUSTOM FACTORS */}
                <section className="bg-slate-900/60 border border-purple-500/30 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        5. Extensible Dynamic Factors (Zero Schema Migration)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Attach any additional developmental, cultural, or behavioral factors dynamically.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addBlankCustomFactor}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white shrink-0"
                    >
                      + Add Custom Factor
                    </button>
                  </div>

                  {catalog && catalog.extensibleFactorTemplates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-slate-400 mr-1 self-center">
                        Preset Templates:
                      </span>
                      {catalog.extensibleFactorTemplates.map((tpl, idx) => (
                        <button
                          key={tpl.key}
                          type="button"
                          onClick={() => addCustomFactorFromTemplate(idx)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200"
                        >
                          + {tpl.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {editingPersona.customFactors.map((cf, index) => (
                      <div
                        key={cf.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={cf.category}
                            onChange={(e) => {
                              const next = [...editingPersona.customFactors];
                              next[index] = { ...cf, category: e.target.value };
                              setEditingPersona({ ...editingPersona, customFactors: next });
                            }}
                            placeholder="Category (e.g., Media Diet)"
                            className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            value={cf.label}
                            onChange={(e) => {
                              const next = [...editingPersona.customFactors];
                              next[index] = { ...cf, label: e.target.value };
                              setEditingPersona({ ...editingPersona, customFactors: next });
                            }}
                            placeholder="Factor Label (e.g., News Habit)"
                            className="sm:col-span-2 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={cf.value}
                            onChange={(e) => {
                              const next = [...editingPersona.customFactors];
                              next[index] = { ...cf, value: e.target.value };
                              setEditingPersona({ ...editingPersona, customFactors: next });
                            }}
                            placeholder="Factor Value"
                            className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditingPersona({
                                ...editingPersona,
                                customFactors: editingPersona.customFactors.filter(
                                  (_, i) => i !== index
                                ),
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-red-950/40 text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          value={cf.influenceDescription}
                          onChange={(e) => {
                            const next = [...editingPersona.customFactors];
                            next[index] = { ...cf, influenceDescription: e.target.value };
                            setEditingPersona({ ...editingPersona, customFactors: next });
                          }}
                          placeholder="Influence on decisions (optional note)"
                          className="w-full rounded-lg bg-slate-900/60 border border-slate-800/80 px-2.5 py-1.5 text-[11px] text-slate-300"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* RIGHT 5 COLUMNS: LIVE HYBRID OUTPUT (MARKDOWN SYSTEM PROMPT + JSON DNA) */}
              <div className="lg:col-span-5">
                <div className="sticky top-20 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100vh-7rem)]">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{editingPersona.avatarEmoji}</span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">
                          {editingPersona.name || 'Unnamed Persona'} • Hybrid Output
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Live Compiled System Prompt (.md) & JSON Schema
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const textToCopy =
                          previewTab === 'md'
                            ? editingPersona.compiledSystemPromptMd || ''
                            : JSON.stringify(editingPersona, null, 2);
                        navigator.clipboard.writeText(textToCopy);
                      }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                  </div>

                  {/* Output Sub-tabs */}
                  <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1">
                    <button
                      onClick={() => setPreviewTab('md')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium ${
                        previewTab === 'md'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Markdown Prompt (.md)
                    </button>
                    <button
                      onClick={() => setPreviewTab('psych')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium ${
                        previewTab === 'psych'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      Psychological Synthesis
                    </button>
                    <button
                      onClick={() => setPreviewTab('json')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium ${
                        previewTab === 'json'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      JSON DNA (.json)
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    {previewTab === 'md' && (
                      <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
                        {editingPersona.compiledSystemPromptMd}
                      </pre>
                    )}

                    {previewTab === 'psych' && editingPersona.synthesizedProfile && (
                      <div className="space-y-3 text-xs">
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                          <span className="font-bold text-indigo-400 block mb-1">
                            Developmental & Age Summary
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {editingPersona.synthesizedProfile.developmentalSummary}
                          </p>
                        </div>
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                          <span className="font-bold text-emerald-400 block mb-1">
                            Financial Trajectory Psychology
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {editingPersona.synthesizedProfile.financialPsychology}
                          </p>
                        </div>
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                          <span className="font-bold text-purple-400 block mb-1">
                            Big-Five Cognitive Decision Filter
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {editingPersona.synthesizedProfile.cognitiveAndDecisionFilter}
                          </p>
                        </div>
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                          <span className="font-bold text-amber-400 block mb-1">
                            Linguistic Tone & Voice
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {editingPersona.synthesizedProfile.linguisticTone}
                          </p>
                        </div>
                      </div>
                    )}

                    {previewTab === 'json' && (
                      <pre className="text-xs font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
                        {JSON.stringify(editingPersona, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* PERSONA DNA / MD INSPECTION MODAL */}
      {inspectedPersona && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setInspectedPersona(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{inspectedPersona.avatarEmoji}</span>
                <div>
                  <h3 className="font-bold text-slate-100">
                    {inspectedPersona.name} — Compiled System Prompt (.MD) & JSON
                  </h3>
                  <p className="text-xs text-slate-400">{inspectedPersona.summaryTagline}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectedPersona(null)}
                className="px-3 py-1 rounded-lg bg-slate-800 text-xs"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase text-indigo-400 mb-2">
                  Compiled Markdown System Prompt (LLM System Input)
                </h4>
                <pre className="text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap text-slate-200">
                  {inspectedPersona.compiledSystemPromptMd}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase text-emerald-400 mb-2">
                  MongoDB JSON Document (Persona DNA)
                </h4>
                <pre className="text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 whitespace-pre-wrap text-emerald-300">
                  {JSON.stringify(inspectedPersona, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LLM & CONNECTION SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base">LLM Engine & Connection Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Google Gemini API Key Override (Optional)
                </label>
                <input
                  type="password"
                  value={apiKeyOverride}
                  onChange={(e) => {
                    setApiKeyOverride(e.target.value);
                    localStorage.setItem('personalab_gemini_key', e.target.value);
                  }}
                  placeholder="Enter API key here or configure in backend/appsettings.json"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Note: If left blank, the backend uses <code>LlmSettings:Gemini:ApiKey</code> from{' '}
                  <code>backend/appsettings.json</code>.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Google Gemini Model
                </label>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Local Ollama Model
                </label>
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default: <code>hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M</code>
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING WARNING TOAST VIEW FOR LLM API ERRORS / QUOTA LIMITS */}
      {chatToastWarnings.length > 0 && (
        <div className="fixed top-20 right-6 z-50 max-w-md w-full space-y-2.5 pointer-events-auto">
          {chatToastWarnings.map((warn, idx) => (
            <div
              key={`${warn.personaId}-${idx}`}
              className="bg-slate-900/95 backdrop-blur-md border border-amber-500/60 rounded-2xl p-4 shadow-2xl shadow-black/70 space-y-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-amber-300 flex items-center gap-1.5">
                      <span>{warn.avatarEmoji}</span>
                      <span>{warn.personaName} • LLM Warning</span>
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      Provider: {warn.provider} ({warn.model})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setChatToastWarnings((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-slate-400 hover:text-white px-1.5 py-0.5 text-sm font-bold"
                  title="Dismiss warning"
                >
                  ×
                </button>
              </div>

              <p className="text-slate-200 leading-relaxed bg-slate-950/90 border border-amber-500/25 rounded-xl p-2.5">
                {warn.errorMessage}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                {warn.provider === 'Gemini' && geminiModel !== 'gemini-3.5-flash-lite' && (
                  <button
                    type="button"
                    onClick={() => {
                      setGeminiModel('gemini-3.5-flash-lite');
                      setChatToastWarnings([]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 font-semibold text-[11px] transition"
                  >
                    Switch to gemini-3.5-flash-lite
                  </button>
                )}
                {provider !== 'Ollama' && (
                  <button
                    type="button"
                    onClick={() => {
                      setProvider('Ollama');
                      setChatToastWarnings([]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 font-semibold text-[11px] transition"
                  >
                    Switch to Local Ollama
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
                >
                  Model Settings
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default App;
