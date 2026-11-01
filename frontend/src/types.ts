export interface DemographicsSection {
  age: number;
  gender: string;
  country: string;
  city: string;
  growingUpEnvironment: string;
  maritalStatus: string;
}

export interface SocioEconomicSection {
  childhoodFinancialStatus: string;
  currentFinancialStatus: string;
  educationLevel: string;
  educationField: string;
  profession: string;
  financialAttitude: string;
}

export interface BigFiveSection {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface ValuesAndInterestsSection {
  interests: string[];
  dislikes: string[];
  coreMotivation: string;
  decisionStyle: string;
  speechStyleNote: string;
}

export interface CustomFactor {
  id: string;
  category: string;
  key: string;
  label: string;
  value: string;
  influenceDescription: string;
}

export interface SynthesizedPsychology {
  developmentalSummary: string;
  financialPsychology: string;
  cognitiveAndDecisionFilter: string;
  linguisticTone: string;
  behavioralRules: string[];
}

export interface PersonaMemoryFact {
  id: string;
  personaId?: string;
  personaName?: string;
  fact: string;
  isConfidential: boolean;
  sourceMode: '1on1' | 'group' | string;
  sourceSessionId: string;
  createdAtUtc: string;
}

export interface PersonaCharacter {
  id?: string;
  name: string;
  avatarEmoji: string;
  summaryTagline: string;
  demographics: DemographicsSection;
  socioEconomic: SocioEconomicSection;
  bigFive: BigFiveSection;
  valuesAndInterests: ValuesAndInterestsSection;
  customFactors: CustomFactor[];
  memoryFacts?: PersonaMemoryFact[];
  synthesizedProfile?: SynthesizedPsychology;
  compiledSystemPromptMd?: string;
  createdAtUtc?: string;
  updatedAtUtc?: string;
}

export interface FactorPresetTemplate {
  category: string;
  key: string;
  label: string;
  suggestedOptions: string[];
  defaultInfluenceHint: string;
}

export interface FactorCatalog {
  genders: string[];
  growingUpEnvironments: string[];
  maritalStatuses: string[];
  childhoodFinancialStatuses: string[];
  currentFinancialStatuses: string[];
  educationLevels: string[];
  educationFields: string[];
  financialAttitudes: string[];
  coreMotivations: string[];
  decisionStyles: string[];
  suggestedInterests: string[];
  extensibleFactorTemplates: FactorPresetTemplate[];
}

export interface PersonaAnswerResult {
  personaId: string;
  personaName: string;
  avatarEmoji: string;
  summaryTagline: string;
  answer: string;
  preferenceRanking: string[];
  innerMonologue: string;
  triggeredFactors: string[];
  providerUsed: string;
  modelUsed: string;
  durationMs: number;
  isFallbackSimulation: boolean;
  hasError?: boolean;
  warningMessage?: string;
}

export interface ArenaAskResponse {
  sessionId: string;
  question: string;
  options: string[];
  results: PersonaAnswerResult[];
  createdAtUtc: string;
}

export interface SystemStatus {
  mongoConnected: boolean;
  databaseName: string;
  personaCount: number;
  defaultProvider: string;
  geminiConfigured: boolean;
  geminiDefaultModel: string;
  ollamaBaseUrl: string;
  ollamaDefaultModel: string;
  ollamaAvailableModels?: string[];
}

export interface ChatParticipant {
  personaId: string;
  name: string;
  avatarEmoji: string;
  summaryTagline: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  personaId?: string;
  personaName?: string;
  avatarEmoji?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToContentPreview?: string;
  content: string;
  providerUsed?: string;
  modelUsed?: string;
  durationMs?: number;
  estimatedTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  extractedMemoryFact?: PersonaMemoryFact;
  hasError?: boolean;
  warningMessage?: string;
  createdAtUtc: string;
}

export interface ChatContextMetrics {
  totalMessageCount: number;
  activeWindowCount: number;
  compactedMessageCount: number;
  estimatedPromptTokens: number;
  rawUncompressedTokens: number;
  savedPercentage: number;
  sessionPromptTokensSpent?: number;
  sessionCompletionTokensSpent?: number;
  sessionTotalTokensSpent?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  isGroupChat: boolean;
  participantPersonaIds: string[];
  participants: ChatParticipant[];
  rollingSummary: string;
  summarizedUpToIndex: number;
  compactionTokensSpent?: number;
  memoryFacts?: PersonaMemoryFact[];
  messages: ChatMessage[];
  contextMetrics: ChatContextMetrics;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface ChatTurnError {
  personaId: string;
  personaName: string;
  avatarEmoji: string;
  provider: string;
  model: string;
  errorMessage: string;
}

export interface ChatMessageTurnResponse {
  session: ChatSession;
  newMessages: ChatMessage[];
  newlyLearnedFacts: PersonaMemoryFact[];
  errors?: ChatTurnError[];
}
