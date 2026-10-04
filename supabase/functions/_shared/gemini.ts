/**
 * Google Gemini API – gemeinsame Anbindung fuer alle Edge Functions.
 *
 * Nutzer: chat-assistant (Max), analyze-vacancy, generate-personalized-email.
 * Doku:   docs/Gemini-Anbindung.md (Abrechnung, Fehlercodes, Modellwechsel)
 *
 * Stand 04.10.2026 – ueberarbeitet nach dem Ausfall vom 01.–04.10.2026:
 *   - Google meldet aufgebrauchtes Vorauszahlungs-Guthaben seit Sept. 2026 mit
 *     HTTP 402 statt 429. Das wurde nirgends erkannt; Max zeigte nur
 *     "Gemini API error: 402". Jetzt: eigene Fehlerklasse GeminiQuotaExhaustedError
 *     mit verstaendlicher deutscher Meldung, fuer 402 UND den alten 429-Text.
 *   - Ein einziger Aufrufpfad (generateContent). chat-assistant hatte vorher
 *     einen eigenen fetch() an dieser Datei vorbei – zwei Stellen mit
 *     unterschiedlicher Fehlerbehandlung.
 *   - API-Schluessel im Header (x-goog-api-key) statt in der URL – URLs landen
 *     in Logs und Fehlermeldungen.
 *   - Zeitlimit pro Aufruf und automatische Wiederholung bei voruebergehenden
 *     Stoerungen (Rate-Limit, 500/503/504, Netzwerkfehler).
 *   - Modell ueber Supabase-Secret GEMINI_MODEL waehlbar, ohne Code-Aenderung.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Zeitlimit je Einzelaufruf. Edge Functions haben insgesamt ca. 150 s. */
const REQUEST_TIMEOUT_MS = 45_000;
/** Wiederholungen nach dem ersten Versuch (nur bei voruebergehenden Fehlern). */
const MAX_RETRIES = 2;
/** Laengere Wartezeiten, die Google per Retry-Info verlangt, warten wir nicht ab. */
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Modellname: Secret GEMINI_MODEL, sonst Standard. Nur einfache Zeichen
 * zulassen, damit ein Tippfehler im Secret nicht die URL verbiegt.
 */
export function getGeminiModel(): string {
  const configured = (Deno.env.get('GEMINI_MODEL') ?? '').trim();
  if (configured && /^[a-z0-9.\-]+$/i.test(configured)) return configured;
  if (configured) {
    console.error('[gemini] GEMINI_MODEL ungueltig, nutze Standard:', configured);
  }
  return DEFAULT_MODEL;
}

// Gemini content/parts format
export interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: Array<{ text: string }> };
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
  toolConfig?: { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } };
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: GeminiPart[];
      role: string;
    };
    finishReason?: string;
  }>;
  promptFeedback?: any;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ---------------------------------------------------------------------------
// Fehlerklassen
// ---------------------------------------------------------------------------

/** Basisklasse. `message` ist so formuliert, dass sie dem Nutzer gezeigt werden kann. */
export class GeminiAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorStatus?: string,
    /** Rohtext von Google (gekuerzt) – nur fuer Logs, nicht fuer die Anzeige. */
    public geminiMessage?: string,
  ) {
    super(message);
    this.name = 'GeminiAPIError';
  }
}

/** Echtes Rate-Limit (zu viele Anfragen pro Minute). Warten hilft. */
export class GeminiRateLimitError extends GeminiAPIError {
  constructor(
    message = 'Der Assistent ist gerade stark ausgelastet. Bitte versuche es in einer Minute erneut.',
    geminiMessage?: string,
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', geminiMessage);
    this.name = 'GeminiRateLimitError';
  }
}

/**
 * Vorauszahlungs-Guthaben aufgebraucht (HTTP 402, frueher 429 mit
 * "prepayment credits are depleted"). Warten hilft NICHT – es muss im
 * Google AI Studio Guthaben gekauft werden. Bewusst KEINE Unterklasse von
 * GeminiRateLimitError, damit niemand faelschlich "spaeter erneut" anzeigt.
 */
export class GeminiQuotaExhaustedError extends GeminiAPIError {
  constructor(geminiMessage?: string) {
    super(
      'Das Gemini-Guthaben ist aufgebraucht. Bitte im Google AI Studio unter ' +
        'Abrechnung → Vorauszahlung Guthaben aufladen. Warten hilft hier nicht.',
      402,
      'QUOTA_EXHAUSTED',
      geminiMessage,
    );
    this.name = 'GeminiQuotaExhaustedError';
  }
}

// ---------------------------------------------------------------------------
// Umwandlung OpenAI-Format -> Gemini-Format
// ---------------------------------------------------------------------------

/** JSON.parse ohne Absturz: ungueltiger Inhalt wird als Text weitergegeben. */
function parseToolContent(content: string): Record<string, any> {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { result: parsed };
  } catch {
    return { result: content };
  }
}

/**
 * Converts OpenAI-style messages to Gemini format
 */
export function convertMessagesToGemini(
  messages: Array<{ role: string; content: string; tool_call_id?: string }>
): { contents: GeminiContent[]; systemInstruction?: { parts: Array<{ text: string }> } } {
  const contents: GeminiContent[] = [];
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text: msg.content }] };
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'tool') {
      // Tool responses go as user messages with functionResponse
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.tool_call_id || 'unknown_tool',
            response: parseToolContent(msg.content)
          }
        }]
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Converts OpenAI-style tools to Gemini function declarations
 */
export function convertToolsToGemini(
  tools: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, any> } }>
): Array<{ functionDeclarations: GeminiFunctionDeclaration[] }> {
  const functionDeclarations = tools
    .filter(t => t.type === 'function')
    .map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }));

  return [{ functionDeclarations }];
}

/**
 * Converts tool_choice to Gemini toolConfig
 */
export function convertToolChoice(toolChoice: string | { type: string; function?: { name: string } }): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } {
  if (toolChoice === 'required' || toolChoice === 'auto') {
    return { functionCallingConfig: { mode: 'AUTO' } };
  } else if (toolChoice === 'none') {
    return { functionCallingConfig: { mode: 'NONE' } };
  } else if (typeof toolChoice === 'object' && toolChoice.type === 'function' && toolChoice.function?.name) {
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.function.name]
      }
    };
  }
  return { functionCallingConfig: { mode: 'AUTO' } };
}

/**
 * Extracts text content from Gemini response
 */
export function extractTextFromResponse(response: GeminiResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  for (const part of parts) {
    if (part.text) return part.text;
  }
  return null;
}

/**
 * Extracts function calls from Gemini response
 */
export function extractFunctionCalls(response: GeminiResponse): Array<{ name: string; args: Record<string, any> }> | null {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return null;

  const functionCalls = parts
    .filter(part => part.functionCall)
    .map(part => ({
      name: part.functionCall!.name,
      args: part.functionCall!.args
    }));

  return functionCalls.length > 0 ? functionCalls : null;
}

/**
 * Checks if response has function calls
 */
export function hasFunctionCalls(response: GeminiResponse): boolean {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return false;
  return parts.some(part => part.functionCall !== undefined);
}

// ---------------------------------------------------------------------------
// Fehler-Einordnung
// ---------------------------------------------------------------------------

/** Texte, an denen Google ein leeres Vorauszahlungs-Guthaben erkennbar macht. */
const QUOTA_EXHAUSTED_MARKERS = ['credits are depleted', 'prepayment', 'prepay', 'billing'];

/**
 * Ordnet eine Fehlerantwort von Google ein. Exportiert, damit sie ohne
 * Netzwerk getestet werden kann.
 *
 * Wichtig: Auch ein gewoehnliches Rate-Limit kommt als 429 mit Status
 * RESOURCE_EXHAUSTED. Diese Woerter allein bedeuten also NICHT "Guthaben leer"
 * – die alte Erkennung im chat-assistant hat deshalb jedes Rate-Limit als
 * Guthabenproblem gemeldet und nie wiederholt.
 */
export function classifyGeminiError(status: number, bodyText: string): GeminiAPIError {
  const snippet = bodyText.slice(0, 500);
  let googleMessage = '';
  let googleStatus: string | undefined;
  try {
    const parsed = JSON.parse(bodyText);
    googleMessage = String(parsed?.error?.message ?? '');
    googleStatus = parsed?.error?.status;
  } catch {
    googleMessage = bodyText;
  }
  const lower = `${googleMessage} ${bodyText}`.toLowerCase();

  if (status === 402 || (status === 429 && QUOTA_EXHAUSTED_MARKERS.some((m) => lower.includes(m)))) {
    return new GeminiQuotaExhaustedError(snippet);
  }
  if (status === 429) {
    return new GeminiRateLimitError(undefined, snippet);
  }
  if (status === 400 && lower.includes('api key')) {
    return new GeminiAPIError(
      'Der Gemini-API-Schlüssel ist ungültig. Bitte das Supabase-Secret GOOGLE_GEMINI_API_KEY prüfen.',
      status, googleStatus, snippet,
    );
  }
  if (status === 403) {
    return new GeminiAPIError(
      'Zugriff auf Gemini verweigert (Schlüssel gesperrt oder API nicht freigeschaltet).',
      status, googleStatus, snippet,
    );
  }
  if (status === 404) {
    return new GeminiAPIError(
      `Das Gemini-Modell „${getGeminiModel()}“ ist nicht verfügbar. Bitte das Secret GEMINI_MODEL prüfen.`,
      status, googleStatus, snippet,
    );
  }
  if (status >= 500) {
    return new GeminiAPIError(
      'Google Gemini ist gerade gestört. Bitte in ein paar Minuten erneut versuchen.',
      status, googleStatus, snippet,
    );
  }
  return new GeminiAPIError(
    `Gemini-Fehler ${status}: ${googleMessage.slice(0, 200) || 'ohne Beschreibung'}`,
    status, googleStatus, snippet,
  );
}

/** Lohnt sich ein zweiter Versuch? Nur bei voruebergehenden Stoerungen. */
function isRetryable(err: GeminiAPIError): boolean {
  if (err instanceof GeminiQuotaExhaustedError) return false;
  if (err instanceof GeminiRateLimitError) return true;
  return err.statusCode === 500 || err.statusCode === 503 || err.statusCode === 504;
}

/** Wartezeit aus Googles RetryInfo ("retryDelay": "17s"), sonst null. */
function retryDelayFromBody(bodyText: string): number | null {
  const match = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.round(parseFloat(match[1]) * 1000) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Der eine Aufrufpfad
// ---------------------------------------------------------------------------

export interface GenerateContentOptions {
  /** Abweichendes Modell nur fuer diesen Aufruf (sonst GEMINI_MODEL / Standard). */
  model?: string;
  /** Zeitlimit je Versuch in ms. */
  timeoutMs?: number;
  /** Anzahl Wiederholungen bei voruebergehenden Fehlern. */
  maxRetries?: number;
  /** Nur fuer Tests: eigener fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Ruft generateContent auf. Wirft bei Fehlern immer einen GeminiAPIError
 * (bzw. eine Unterklasse) mit anzeigbarer Meldung – nie einen rohen Fehler.
 */
export async function generateContent(
  apiKey: string,
  requestBody: GeminiRequest | Record<string, unknown>,
  options: GenerateContentOptions = {},
): Promise<GeminiResponse> {
  const model = options.model ?? getGeminiModel();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;
  const body = JSON.stringify(requestBody);

  let lastError: GeminiAPIError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let waitMs = 1000 * 2 ** attempt; // 1 s, 2 s, 4 s …
    let giveUp = false;

    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();

      if (response.ok) {
        try {
          return JSON.parse(text) as GeminiResponse;
        } catch {
          throw new GeminiAPIError(
            'Google Gemini hat eine unlesbare Antwort geschickt. Bitte erneut versuchen.',
            502, 'INVALID_JSON', text.slice(0, 500),
          );
        }
      }

      lastError = classifyGeminiError(response.status, text);
      console.error('[gemini] Fehler', {
        attempt: attempt + 1,
        status: response.status,
        model,
        art: lastError.name,
        google: lastError.geminiMessage,
      });

      const requested = retryDelayFromBody(text);
      if (requested !== null) {
        if (requested > MAX_RETRY_DELAY_MS) giveUp = true; // zu lange – sofort melden
        waitMs = Math.max(waitMs, requested);
      }
      if (giveUp || !isRetryable(lastError)) throw lastError;
    } catch (err) {
      if (err instanceof GeminiAPIError) {
        if (err !== lastError || giveUp || !isRetryable(err)) throw err;
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        // Zeitlimit: nicht wiederholen – ein zweiter Versuch dauert vermutlich
        // genauso lange und sprengt das Zeitbudget der Edge Function.
        throw new GeminiAPIError(
          `Google Gemini hat nicht innerhalb von ${Math.round(timeoutMs / 1000)} Sekunden geantwortet.`,
          504, 'TIMEOUT',
        );
      } else {
        // Netzwerkfehler (DNS, Verbindungsabbruch): wiederholbar
        console.error('[gemini] Netzwerkfehler', { attempt: attempt + 1, err: String(err) });
        lastError = new GeminiAPIError(
          'Keine Verbindung zu Google Gemini. Bitte erneut versuchen.',
          503, 'NETWORK', String(err).slice(0, 500),
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxRetries) await sleep(waitMs);
  }

  throw lastError ?? new GeminiAPIError('Unbekannter Gemini-Fehler', 500, 'UNKNOWN');
}

// ---------------------------------------------------------------------------
// Bequeme Wrapper (unveraenderte Schnittstelle)
// ---------------------------------------------------------------------------

export interface GeminiCallOptions {
  systemPrompt?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, any> } }>;
  toolChoice?: string | { type: string; function?: { name: string } };
  maxTokens?: number;
  temperature?: number;
}

/**
 * Main function to call Gemini API (OpenAI-artige Eingabe)
 */
export async function callGemini(apiKey: string, options: GeminiCallOptions): Promise<GeminiResponse> {
  const { systemPrompt, messages, tools, toolChoice, maxTokens, temperature } = options;

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const { contents, systemInstruction } = convertMessagesToGemini(allMessages);

  const requestBody: GeminiRequest = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens || 2048,
      temperature: temperature ?? 0.7
    }
  };

  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }

  if (tools && tools.length > 0) {
    requestBody.tools = convertToolsToGemini(tools);
    if (toolChoice) {
      requestBody.toolConfig = convertToolChoice(toolChoice);
    }
  }

  return await generateContent(apiKey, requestBody);
}

/**
 * Simple text completion (no tools)
 */
export async function geminiTextCompletion(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await callGemini(apiKey, {
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: options?.maxTokens,
    temperature: options?.temperature
  });

  const text = extractTextFromResponse(response);
  if (!text) {
    throw new GeminiAPIError('Gemini hat keine Textantwort geliefert.', 500, 'EMPTY_RESPONSE');
  }
  return text;
}

/**
 * Structured output via function calling
 */
export async function geminiStructuredOutput<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tool: { name: string; description: string; parameters: Record<string, any> }
): Promise<T> {
  const response = await callGemini(apiKey, {
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{ type: 'function', function: tool }],
    toolChoice: { type: 'function', function: { name: tool.name } },
    maxTokens: 4096
  });

  const functionCalls = extractFunctionCalls(response);
  if (functionCalls && functionCalls.length > 0) {
    return functionCalls[0].args as T;
  }

  // Fallback: try to parse JSON from text response
  const text = extractTextFromResponse(response);
  if (text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
    } catch (e) {
      console.error('[gemini] Fallback-JSON nicht lesbar:', e);
    }
  }

  throw new GeminiAPIError('Gemini hat kein strukturiertes Ergebnis geliefert.', 500, 'NO_FUNCTION_CALL');
}
