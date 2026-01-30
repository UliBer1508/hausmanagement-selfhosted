/**
 * Google Gemini API Helper Module
 * Provides utilities for converting OpenAI-compatible formats to native Gemini format
 * and handling API calls to the free Gemini API tier.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  toolConfig?: { functionCallingConfig: { mode: string } };
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
            response: JSON.parse(msg.content)
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

export interface GeminiCallOptions {
  systemPrompt?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, any> } }>;
  toolChoice?: string | { type: string; function?: { name: string } };
  maxTokens?: number;
  temperature?: number;
}

/**
 * Main function to call Gemini API
 */
export async function callGemini(apiKey: string, options: GeminiCallOptions): Promise<GeminiResponse> {
  const { systemPrompt, messages, tools, toolChoice, maxTokens, temperature } = options;

  // Build contents from messages
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

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiRateLimitError('Rate limit exceeded. Please try again later.');
    }
    throw new GeminiAPIError(
      data.error?.message || `Gemini API error: ${response.status}`,
      response.status,
      data.error?.status
    );
  }

  return data as GeminiResponse;
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
    throw new GeminiAPIError('No text content in response', 500, 'EMPTY_RESPONSE');
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
    toolChoice: { type: 'function', function: { name: tool.name } }
  });

  const functionCalls = extractFunctionCalls(response);
  if (!functionCalls || functionCalls.length === 0) {
    throw new GeminiAPIError('No function call in response', 500, 'NO_FUNCTION_CALL');
  }

  return functionCalls[0].args as T;
}

// Custom error classes
export class GeminiAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorStatus?: string
  ) {
    super(message);
    this.name = 'GeminiAPIError';
  }
}

export class GeminiRateLimitError extends GeminiAPIError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'GeminiRateLimitError';
  }
}
