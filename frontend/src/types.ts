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
