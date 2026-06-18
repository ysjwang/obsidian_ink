import { requestUrl } from "obsidian";
import InkPlugin from "src/main";
import { TranscriptionProvider } from "src/types/plugin-settings";
import { verbose } from "src/utils/log-to-console";

///////////////////
///////////////////

// Suggested models per provider. The settings UI offers these as presets but
// also allows a free-text override, since provider model lineups change often.
export const MODEL_PRESETS: Record<TranscriptionProvider, { label: string, id: string }[]> = {
    claude: [
        { label: 'Claude Opus 4.8 (most accurate)', id: 'claude-opus-4-8' },
        { label: 'Claude Haiku 4.5 (cheapest)', id: 'claude-haiku-4-5' },
    ],
    gemini: [
        { label: 'Gemini 2.5 Pro (most accurate)', id: 'gemini-2.5-pro' },
        { label: 'Gemini 2.5 Flash (cheapest)', id: 'gemini-2.5-flash' },
    ],
};

export const PROVIDER_LABELS: Record<TranscriptionProvider, string> = {
    claude: 'Anthropic (Claude)',
    gemini: 'Google (Gemini)',
};

const TRANSCRIBE_PROMPT =
    'Transcribe the handwriting in this image to Markdown. ' +
    'Preserve line breaks, lists, and headings where they are visually apparent. ' +
    'Output only the transcription — no preamble, no commentary, no code fences.';

const MAX_OUTPUT_TOKENS = 4096;

// Old stubbed auto-transcript flow (kept so fetchTranscript.ts still compiles).
// The live transcription path is transcribeImage() below.
export async function fetchWriteFileTranscript(): Promise<string> {
    verbose('Transcripts not implemented yet');
    return 'transcript';
}

///////////////////
///////////////////

type ParsedImage = { mediaType: string; base64: string };

// Splits a data URI (e.g. "data:image/png;base64,AAAA") into media type + raw base64.
function parseDataUri(dataUri: string): ParsedImage {
    const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUri);
    if (!match) throw new Error('Image is not a base64 data URI');
    return { mediaType: match[1], base64: match[2] };
}

/**
 * Sends a rendered handwriting image to the configured AI provider and returns
 * the transcribed text as Markdown. Uses Obsidian's requestUrl so it works on
 * mobile and bypasses CORS. Throws with a user-readable message on failure.
 */
export async function transcribeImage(plugin: InkPlugin, pngDataUri: string): Promise<string> {
    const { transcriptionProvider } = plugin.settings;
    const image = parseDataUri(pngDataUri);

    switch (transcriptionProvider) {
        case 'claude':
            return transcribeWithClaude(plugin, image);
        case 'gemini':
            return transcribeWithGemini(plugin, image);
        default:
            throw new Error(`Unknown transcription provider: ${transcriptionProvider}`);
    }
}

///////////////////
// Provider adapters
///////////////////

async function transcribeWithClaude(plugin: InkPlugin, image: ParsedImage): Promise<string> {
    const apiKey = plugin.settings.anthropicApiKey?.trim();
    if (!apiKey) throw new Error('No Anthropic API key set. Add one in the Ink plugin settings.');

    const res = await requestUrl({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        throw: false,
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: plugin.settings.transcriptionModel,
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
                    { type: 'text', text: TRANSCRIBE_PROMPT },
                ],
            }],
        }),
    });

    if (res.status < 200 || res.status >= 300) {
        throw new Error(claudeErrorMessage(res.status, res.json));
    }

    const data = res.json;
    if (data?.stop_reason === 'refusal') {
        throw new Error('The model declined to transcribe this image.');
    }
    const text = data?.content?.find((b: any) => b.type === 'text')?.text;
    if (!text) throw new Error('No transcription returned by Claude.');
    return text.trim();
}

async function transcribeWithGemini(plugin: InkPlugin, image: ParsedImage): Promise<string> {
    const apiKey = plugin.settings.geminiApiKey?.trim();
    if (!apiKey) throw new Error('No Gemini API key set. Add one in the Ink plugin settings.');

    const model = encodeURIComponent(plugin.settings.transcriptionModel);
    const res = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        method: 'POST',
        throw: false,
        headers: {
            'x-goog-api-key': apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inline_data: { mime_type: image.mediaType, data: image.base64 } },
                    { text: TRANSCRIBE_PROMPT },
                ],
            }],
            generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
    });

    if (res.status < 200 || res.status >= 300) {
        throw new Error(geminiErrorMessage(res.status, res.json));
    }

    const data = res.json;
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = parts?.map((p: any) => p.text).filter(Boolean).join('');
    if (!text) throw new Error('No transcription returned by Gemini.');
    return text.trim();
}

///////////////////
// Error messages
///////////////////

function claudeErrorMessage(status: number, body: any): string {
    const detail = body?.error?.message || '';
    if (status === 401) return 'Anthropic API key is invalid. Check it in the Ink plugin settings.';
    if (status === 429) return 'Anthropic rate limit reached. Try again shortly.';
    return `Transcription failed (Claude ${status}). ${detail}`.trim();
}

function geminiErrorMessage(status: number, body: any): string {
    const detail = body?.error?.message || '';
    if (status === 400 && /API key/i.test(detail)) return 'Gemini API key is invalid. Check it in the Ink plugin settings.';
    if (status === 429) return 'Gemini rate limit reached. Try again shortly.';
    return `Transcription failed (Gemini ${status}). ${detail}`.trim();
}
