/**
  * Prompt Panel
 */

const EXT    = 'prompt-panel';
// CSS URL is derived from this script's own URL (import.meta.url) so it works
// regardless of the actual folder name on disk (e.g. when installed via GitHub
// the folder may be named after the repo, not after EXT).
const SELF_DIR_URL = (() => {
    try { return new URL('./', import.meta.url).href; } catch(e) { return ''; }
})();
const CSS_URL = SELF_DIR_URL ? (SELF_DIR_URL + 'style.css') : '';

// Status Tray / QR Floating 방식: parent.document
const PAR  = (function(){ try { return window.parent || window; } catch(e){ return window; } })();
const PDOC = (function(p){ try { return p.document || document; } catch(e){ return document; } })(PAR);

// ── Dynamic imports ────────────────────────────────────────────────────
let getRequestHeaders, saveSettingsDebounced, eventSource, event_types,
    extension_settings, getContext,
    oai_settings, openai_settings, openai_setting_names,
    characters, unshallowCharacter, world_names, world_info, getSortedEntries;

async function initImports() {
    const s = import.meta.url;
    const tp = s.includes('/third-party/');
    const base  = tp ? '../../../../' : '../../../';
    const base2 = tp ? '../../../'    : '../../';

    const sm = await import(base + 'script.js');
    getRequestHeaders     = sm.getRequestHeaders;
    saveSettingsDebounced = sm.saveSettingsDebounced;
    eventSource           = sm.eventSource;
    event_types           = sm.event_types;
    characters            = sm.characters;
    unshallowCharacter    = sm.unshallowCharacter;

    const om = await import(base2 + 'openai.js');
    oai_settings         = om.oai_settings;
    openai_settings      = om.openai_settings;
    openai_setting_names = om.openai_setting_names;

    const em = await import(base2 + 'extensions.js');
    extension_settings = em.extension_settings;
    getContext         = em.getContext;

    const wi = await import(base2 + 'world-info.js');
    getSortedEntries = wi.getSortedEntries;
    world_names      = wi.world_names;
    world_info       = wi.world_info;
}

// ── Providers ─────────────────────────────────────────────────────────
const PROVIDER_LIST = [
    { key: 'openai',     label: 'OpenAI',           source: 'openai'     },
    { key: 'claude',     label: 'Claude',           source: 'claude'     },
    { key: 'google',     label: 'Google AI Studio', source: 'makersuite' },
    { key: 'vertexai',   label: 'Google Vertex AI', source: 'vertexai'   },
    { key: 'openrouter', label: 'OpenRouter',       source: 'openrouter' },
    { key: 'deepseek',   label: 'DeepSeek',         source: 'deepseek'   },
    { key: 'mistralai',  label: 'MistralAI',        source: 'mistralai'  },
    { key: 'groq',       label: 'Groq',             source: 'groq'       },
    { key: 'cohere',     label: 'Cohere',           source: 'cohere'     },
    { key: 'xai',        label: 'xAI (Grok)',       source: 'xai'        },
    { key: 'zai',        label: 'Z.AI (GLM)',       source: 'zai'        },
];
const PROVIDER_MODELS = {
    openai:     ['gpt-4o','gpt-4o-mini','gpt-4.1','gpt-4.1-mini','gpt-4.1-nano','o3','o3-mini','o4-mini','chatgpt-4o-latest','gpt-4-turbo','gpt-3.5-turbo'],
    claude:     ['claude-opus-4-6','claude-opus-4-5','claude-sonnet-4-6','claude-sonnet-4-5','claude-haiku-4-5','claude-3-7-sonnet-latest','claude-3-5-sonnet-latest','claude-3-5-haiku-latest','claude-3-opus-20240229'],
    google:     ['gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-pro-preview','gemini-3.1-flash-lite','gemini-3.1-flash-lite-preview','gemini-3-pro-preview','gemini-3-flash-preview','gemini-2.5-pro','gemini-2.5-flash','gemini-2.5-flash-lite'],
    vertexai:   ['gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite','gemini-3.1-pro-preview','gemini-3.1-flash-lite','gemini-3.1-flash-lite-preview','gemini-3-pro-preview','gemini-3-flash-preview','gemini-2.5-pro','gemini-2.5-flash','gemini-2.5-flash-lite'],
    openrouter: ['deepseek/deepseek-r1','deepseek/deepseek-chat','google/gemini-2.5-pro','google/gemini-2.5-flash','anthropic/claude-3-haiku','meta-llama/llama-3-70b-instruct'],
    deepseek:   ['deepseek-v4-pro','deepseek-v4-flash'],
    mistralai:  ['mistral-large-latest','mistral-medium-latest','mistral-small-latest','open-mistral-nemo','pixtral-large-latest'],
    groq:       ['llama-3.3-70b-versatile','llama-3.1-70b-versatile','gemma2-9b-it','qwen/qwen3-32b','deepseek-r1-distill-llama-70b','mixtral-8x7b-32768'],
    cohere:     ['command-a-03-2025','command-r-plus','command-r','c4ai-aya-expanse-32b'],
    xai:        ['grok-4','grok-3','grok-3-mini','grok-2'],
    zai:        ['glm-5.2','glm-5.1','glm-5','glm-5-turbo','glm-4.7','glm-4.7-flash','glm-4.6','glm-4.5-flash'],
};
const PROVIDER_TO_SOURCE = {
    openai:'openai', claude:'claude', google:'makersuite', vertexai:'vertexai',
    openrouter:'openrouter', deepseek:'deepseek', mistralai:'mistralai', groq:'groq', cohere:'cohere', xai:'xai', zai:'zai',
};
const DEFAULT_PARAMS = {
    openai:     { temperature:1, top_p:1, frequency_penalty:0, presence_penalty:0 },
    claude:     { temperature:1, top_p:1, top_k:0 },
    google:     { temperature:1, top_p:1, top_k:0 },
    vertexai:   { temperature:1, top_p:1, top_k:0 },
    openrouter: { temperature:1, top_p:1, frequency_penalty:0, presence_penalty:0 },
    deepseek:   { temperature:1, top_p:1, frequency_penalty:0, presence_penalty:0 },
    mistralai:  { temperature:1, top_p:1 },
    groq:       { temperature:1, top_p:1 },
    cohere:     { temperature:1, top_p:1, top_k:0, frequency_penalty:0, presence_penalty:0 },
    xai:        { temperature:1, top_p:1, frequency_penalty:0, presence_penalty:0 },
    zai:        { temperature:1, top_p:1 },
};
const PARAM_LABELS = { temperature:'Temperature', top_p:'Top P', top_k:'Top K', frequency_penalty:'Freq. Penalty', presence_penalty:'Pres. Penalty' };
const PARAM_RANGES = { temperature:{min:0,max:2,step:0.05}, top_p:{min:0,max:1,step:0.01}, top_k:{min:0,max:200,step:1}, frequency_penalty:{min:-2,max:2,step:0.05}, presence_penalty:{min:-2,max:2,step:0.05} };

function getProviderSpecificParams(provider, params) {
    const out = { temperature: params.temperature };
    if (['openai','openrouter','deepseek','xai'].includes(provider)) {
        out.top_p = params.top_p; out.frequency_penalty = params.frequency_penalty; out.presence_penalty = params.presence_penalty;
    } else if (['claude','google','vertexai'].includes(provider)) {
        out.top_p = params.top_p; out.top_k = params.top_k;
    } else if (provider === 'cohere') {
        out.top_p = params.top_p; out.top_k = params.top_k; out.frequency_penalty = params.frequency_penalty; out.presence_penalty = params.presence_penalty;
    } else {
        out.top_p = params.top_p;
    }
    return out;
}

// ── Settings ──────────────────────────────────────────────────────────
function cfg() {
    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    const c = extension_settings[EXT];
    if (!c.targetLang)    c.targetLang    = 'Korean';
    if (!c.provider)      c.provider      = 'openai';
    if (!c.model)         c.model         = 'gpt-4o-mini';
    if (c.prefillEnabled === undefined) c.prefillEnabled = true;
    if (!c.prefillText)   c.prefillText   = 'Understood. Executing the translation as instructed. Here is the translation:';
    if (c.useReverseProxy === undefined) c.useReverseProxy = false;
    if (!c.reverseProxyUrl) c.reverseProxyUrl = '';
    if (!c.reverseProxyPassword) c.reverseProxyPassword = '';
    if (!c.theme)         c.theme         = 'dark';
    if (c.fabVisible === undefined) c.fabVisible = true;
    if (typeof c.originalFontSize !== 'number')   c.originalFontSize   = 11;
    if (typeof c.translatedFontSize !== 'number') c.translatedFontSize = 12;
    // Throttling / batching
    if (typeof c.titleBatchSize !== 'number' || c.titleBatchSize < 1) c.titleBatchSize = 15;
    if (typeof c.requestDelayMs !== 'number' || c.requestDelayMs < 0) c.requestDelayMs = 60;
    if (!c.parameters) c.parameters = {};
    for (const k in DEFAULT_PARAMS) if (!c.parameters[k]) c.parameters[k] = {...DEFAULT_PARAMS[k]};
    return c;
}

function getCurrentParams() {
    const c = cfg();
    const prov = c.provider || 'openai';
    if (!c.parameters[prov]) c.parameters[prov] = {...(DEFAULT_PARAMS[prov]||DEFAULT_PARAMS.openai)};
    return { provider: prov, params: c.parameters[prov] };
}

// ── Translation Cache Layer (IndexedDB + in-memory Map) ──────────────
// Design: IndexedDB for persistence, Map for sync reads matching old API
const DB_NAME = 'PTTranslationDB_PLUS';
const DB_VERSION = 1;
const STORE = 'translations';
let _db = null;
let _dbFailed = false;
const translationMap = new Map();  // in-memory mirror, key → translation string

function openTranslationDB() {
    return new Promise((resolve, reject) => {
        if (_db) return resolve(_db);
        if (_dbFailed) return reject(new Error('IndexedDB unavailable'));
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, { keyPath: 'cacheKey' });
                    store.createIndex('savedAt', 'savedAt', { unique: false });
                }
            };
            req.onsuccess = (ev) => { _db = ev.target.result; resolve(_db); };
            req.onerror  = (ev) => {
                _dbFailed = true;
                console.warn(`[${EXT}] IndexedDB open failed, falling back to in-memory only`, ev);
                reject(new Error('IndexedDB open failed'));
            };
        } catch (e) {
            _dbFailed = true;
            console.warn(`[${EXT}] IndexedDB unavailable, in-memory fallback`, e);
            reject(e);
        }
    });
}

async function dbGetAll() {
    try {
        const db = await openTranslationDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        });
    } catch(e) { return []; }
}

async function dbPut(cacheKey, translation) {
    try {
        const db = await openTranslationDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put({ cacheKey, translation, savedAt: Date.now() });
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    } catch(e) { /* silent — memory Map is still source of truth for session */ }
}

async function dbDelete(cacheKey) {
    try {
        const db = await openTranslationDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(cacheKey);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    } catch(e) {}
}

async function dbClear() {
    try {
        const db = await openTranslationDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).clear();
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    } catch(e) {}
}

// Load all translations into memory Map at startup
async function initTranslationCache() {
    // Load existing IndexedDB records into the in-memory Map.
    const all = await dbGetAll();
    for (const rec of all) {
        if (rec.cacheKey && rec.translation) {
            translationMap.set(rec.cacheKey, rec.translation);
        }
    }
    console.log(`[${EXT}] Translation cache loaded: ${translationMap.size} entries`);
}

// Effective target language string.
// The dropdown may hold the sentinel '__custom__', in which case the user's
// free-text language (customLang) is what we actually send to the model and
// what we key the cache by. Never let '__custom__' itself reach a cache key.
function effLang() {
    const c = cfg();
    if (c.targetLang === '__custom__') {
        const custom = (c.customLang || '').trim();
        return custom || 'Korean';
    }
    return c.targetLang || 'Korean';
}

const ck        = (ns, id) => `${ns}::${id}::${effLang()}`;
const getCached = (ns, id) => translationMap.get(ck(ns, id)) ?? null;
const setCache  = (ns, id, t) => {
    const key = ck(ns, id);
    translationMap.set(key, t);
    dbPut(key, t);  // fire-and-forget async persist
};

// Title-only translations live in a sibling namespace so that they never
// shadow a full translation. Consequences of this separation:
//   - Pressing 번역 later still performs a full translation (no cache hit).
//   - 👀 and script export prefer the full translation's title when present,
//     and fall back to the title-only cache otherwise.
const titleNS = (ns) => `${ns}@title`;
// Drop a title-only entry. Called when a full translation succeeds, so the
// newer full translation's title wins. Without this, a stale title-only
// result would keep overriding it (title cache has higher precedence).
const clearCachedTitle = (ns, id) => {
    const key = ck(titleNS(ns), id);
    translationMap.delete(key);
    dbDelete(key);
};
const getCachedTitle = (ns, id) => translationMap.get(ck(titleNS(ns), id)) ?? null;
const setCacheTitle  = (ns, id, t) => {
    const key = ck(titleNS(ns), id);
    translationMap.set(key, t);
    dbPut(key, t);
};

const clearNS = (ns, ids) => {
    ids.forEach(id => {
        [ck(ns, id), ck(titleNS(ns), id)].forEach(key => {
            translationMap.delete(key);
            dbDelete(key);
        });
    });
};

// Stats helper for UI
function getCacheStats() {
    let totalChars = 0;
    for (const v of translationMap.values()) totalChars += v.length;
    const bytes = totalChars * 2;  // UTF-16 approx
    const kb = bytes / 1024;
    const sizeStr = kb > 1024 ? `${(kb/1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
    return { count: translationMap.size, sizeStr };
}

function estimateTokens(text) {
    if (!text) return 0;
    try { const ctx=SillyTavern?.getContext?.(); if(ctx&&typeof ctx.getTokenCount==='function') return ctx.getTokenCount(text); } catch(e) {}
    const cjk=(text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)||[]).length;
    return Math.ceil(cjk/1.5+(text.length-cjk)/4);
}

let isBusy=false, stopReq=false;

// ── Translation ─────────────────────────────────────────────────
async function translateText(name, text, extraNonce) {
    const hasName    = !!(name && name.trim());
    const hasContent = !!(text && text.trim());
    // Nothing translatable at all → skip
    if (!hasName && !hasContent) return '';
    const c = cfg();
    const lang = effLang();
    const nonce = extraNonce ? `\n<!--retry:${extraNonce}-->` : '';
    // Compose what we send to the model:
    //   - name + content → "### {name}\n\n{content}"
    //   - name only     → "### {name}"   (title-only translation)
    //   - content only  → "{content}"
    const combined = hasName && hasContent
        ? `### ${name}\n\n${text}`
        : (hasName ? `### ${name}` : text);

    const prompt =
`Translate the following text into ${lang}.

RULES:
1. Translate ALL human-readable text including headings, labels, titles, and body content.
2. Do NOT translate: HTML/XML tags, {{char}}, {{user}}, {{getvar::*}}, {{setvar::*}}, {{random::*}}, regex patterns, JSON keys, code, URLs, emoji.
3. Do NOT alter references to languages, nationalities, cultures, or styles. For example: if the source says "Chinese style" or "中文风格" or "중국식", translate those words literally — do NOT replace them with the target language name.
4. Preserve all markdown, whitespace, indentation, and line breaks exactly.
5. Output ONLY the translated text — no preamble, no "Here is:", no meta-commentary.
6. Never echo the source text back unchanged. Even if the source is already close to ${lang}, produce a proper ${lang} rendering.
7. If a line starts with "**Keys:**" or "**Filters:**", keep that exact prefix and the comma-separated list format, and keep it on its own line at the top. Translate each item into ${lang}. These are trigger keywords, so render them as the natural word a reader would actually type, not as a literal gloss.

--- SOURCE ---
${combined}
--- END ---

Now output the above text translated into ${lang}.${nonce}`;

    const prov = c.provider||'openai';
    const source = PROVIDER_TO_SOURCE[prov]||prov;
    const model = (c.model==='__custom__' ? (c.customModelName||'') : (c.model||'')) || '';

    const messages = [{ role:'user', content:prompt }];
    if (c.prefillEnabled && c.prefillText?.trim()) {
        const role = (source==='makersuite'||source==='google'||source==='vertexai') ? 'model' : 'assistant';
        messages.push({ role, content:c.prefillText.trim() });
    }

    const { provider:providerKey, params } = getCurrentParams();
    const providerParams = getProviderSpecificParams(providerKey, params);
    const parameters = { model, messages, stream:false, chat_completion_source:source, ...providerParams };
    if (source==='vertexai') {
        // Read Vertex auth mode and region from ST's main API settings (oai_settings).
        // Hardcoding 'full' breaks users whose ST is configured in 'express' mode,
        // and missing region/project_id causes 404 on certain models.
        // Fallback to 'full' preserves the previous behaviour when settings are absent.
        parameters.vertexai_auth_mode = oai_settings?.vertexai_auth_mode || 'full';
        const region = oai_settings?.vertexai_region;
        if (region) parameters.vertexai_region = region;
        if (parameters.vertexai_auth_mode === 'express' && oai_settings?.vertexai_express_project_id) {
            parameters.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
        }
    }
    if (c.useReverseProxy && c.reverseProxyUrl?.trim()) {
        parameters.reverse_proxy = c.reverseProxyUrl.trim();
        parameters.proxy_password = c.reverseProxyPassword||'';
    }
    if (extraNonce) {
        parameters.top_p = Math.min(1,(params.top_p??1)*0.97);
        if ('top_k' in providerParams) parameters.top_k = Math.max(1, params.top_k||40);
    }

    const res = await fetch('/api/backends/chat-completions/generate', {
        method:'POST', headers:{...getRequestHeaders(),'Content-Type':'application/json'},
        body:JSON.stringify(parameters),
    });
    if (!res.ok) {
        let msg=`HTTP ${res.status}`;
        try { const err=await res.json(); msg=err?.error?.message||err?.message||msg; } catch(e){}
        throw new Error(msg);
    }
    const d = await res.json();
    let result = d.choices?.[0]?.message?.content?.trim()
        || d.content?.[0]?.text?.trim()
        || d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    result = result.replace(/^---\s*SOURCE\s*---\s*\n?/i,'').replace(/\n?---\s*END\s*---\s*$/i,'').trim();
    return result;
}

// ── Preset ────────────────────────────────────────────────────────────
function listAllPresets() {
    if (!openai_settings||!openai_setting_names) return [];
    return Object.keys(openai_setting_names).filter(n=>openai_settings[openai_setting_names[n]]).map(n=>({id:n,name:n}));
}
function getCurrentPresetName() {
    if (oai_settings?.preset_settings_openai) return oai_settings.preset_settings_openai;
    for (const s of ['#settings_preset','#preset_name_select','select[name="preset_name"]']) {
        const el=document.querySelector(s); if(!el) continue;
        const txt=el.options[el.selectedIndex]?.text?.trim(); if(txt&&txt!=='—') return txt;
    }
    return '';
}
function readPresetBlocks(presetName) {
    const blocks=[];
    try {
        const cur=getCurrentPresetName();
        let preset=(!presetName||presetName===cur)?oai_settings:openai_settings[openai_setting_names[presetName]];
        if (!preset) return blocks;
        const prompts=preset.prompts||[];
        const allOrders=preset.prompt_order||[];
        const charOrder=allOrders.find(o=>String(o.character_id)==='100001')||allOrders.find(o=>String(o.character_id)==='100000')||allOrders[0];
        const order=charOrder?.order||[];
        const map=Object.fromEntries(prompts.map(p=>[p.identifier,p]));
        const systemIds=new Set(['main','worldInfoBefore','worldInfoAfter','charDescription','charPersonality','scenario','personaDescription','enhanceDefinitions','nsfw','dialogueExamples','chatHistory','jailbreak']);
        for (const entry of order) {
            const p=map[entry.identifier]; if(!p) continue;
            blocks.push({ id:p.identifier, name:p.name||p.identifier, enabled:entry.enabled!==false, content:p.content||'', isCustom:!systemIds.has(p.identifier) });
        }
    } catch(e) { console.warn(`[${EXT}]`,e); }
    return blocks;
}

// ── World Info ────────────────────────────────────────────────────────
function listAllWorldInfos() {
    const items=[];
    try {
        if (Array.isArray(world_names)&&world_names.length) { world_names.forEach(n=>{if(n)items.push({id:n,name:n});}); return items; }
        const sel=document.querySelector('#world_editor_select');
        if (sel) Array.from(sel.options).forEach(o=>{const v=(o.value||o.textContent||'').trim();if(v)items.push({id:v,name:v});});
    } catch(e){}
    return items;
}
// Marker used to carry world-info keywords through the translation round-trip.
const KEYS_MARKER = '**Keys:**';
const FILTERS_MARKER = '**Filters:**';

// Pull the "**Keys:** a, b, c" line out of a body.
// Returns { keys: string[]|null, body } — keys is null when the line is absent,
// in which case callers keep the original keywords untouched.
function splitKeysAndBody(text) {
    if (typeof text !== 'string' || !text) return { keys: null, filters: null, body: text || '' };
    const lines = text.split(/\r?\n/);
    const parseList = v => {
        const out = v.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        return out.length ? out : null;
    };
    let keys = null, filters = null, consumed = -1;
    // Both marker lines sit in the leading block, in either order, possibly
    // separated by blank lines. Scanning stops at the first content line.
    for (let i = 0; i < lines.length && i < 6; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '') continue;
        // Accepts "**Keys:** a, b" / "**Keys**: a, b" / "Keys: a, b" / "Keys： a, b"
        const mk = trimmed.match(/^\*{0,2}\s*Keys\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*(.*?)\s*\*{0,2}$/i);
        if (mk) { keys = parseList(mk[1]); consumed = i; continue; }
        const mf = trimmed.match(/^\*{0,2}\s*Filters?\s*\*{0,2}\s*[:：]\s*\*{0,2}\s*(.*?)\s*\*{0,2}$/i);
        if (mf) { filters = parseList(mf[1]); consumed = i; continue; }
        break;
    }
    if (consumed < 0) return { keys: null, filters: null, body: text };
    const body = lines.slice(consumed + 1).join('\n').replace(/^(\s*\r?\n)+/, '');
    return { keys, filters, body };
}

// Compact, display-only metadata for a world-info entry.
function readEntryMeta(e) {
    if (!e) return null;
    const posMap = { 0:'↑Char', 1:'↓Char', 2:'↑AN', 3:'↓AN', 4:'@D', 5:'↑EM', 6:'↓EM' };
    const pos = posMap[e.position] ?? (e.position != null ? String(e.position) : '');
    const strat = e.constant ? 'const' : (e.vectorized ? 'vector' : 'normal');
    return {
        strategy: strat,
        position: pos,
        depth: (e.position === 4 && e.depth != null) ? e.depth : null,
        order: e.order ?? null,
        probability: (e.useProbability === false) ? null : (e.probability ?? null),
    };
}

async function readWorldInfo(wiName) {
    const entries=[];
    if (!wiName) return entries;
    try {
        const ctx=SillyTavern.getContext();
        let bookData=null;
        if (typeof ctx.loadWorldInfo==='function') bookData=await ctx.loadWorldInfo(wiName);
        if (!bookData?.entries&&world_info?.[wiName]?.entries) bookData=world_info[wiName];
        if (!bookData?.entries) return entries;
        const rawEntries=Object.entries(bookData.entries);
        rawEntries.sort((a,b)=>Number(a[1]?.uid??a[0])-Number(b[1]?.uid??b[0]));
        for (const [uid,e] of rawEntries) {
            const keys = Array.isArray(e.key) ? e.key.filter(k => String(k||'').trim()) : [];
            const filters = Array.isArray(e.keysecondary) ? e.keysecondary.filter(k => String(k||'').trim()) : [];
            // Keywords and the optional filter ride along inside the translated
            // body as leading marker lines — the same trick already used for
            // titles. This keeps one translation unit per entry, so cache keys,
            // progress, search and 👀 all stay unchanged.
            const body = e.content || '';
            const header = [];
            if (keys.length)    header.push(`${KEYS_MARKER} ${keys.join(', ')}`);
            if (filters.length) header.push(`${FILTERS_MARKER} ${filters.join(', ')}`);
            const content = header.length ? `${header.join('\n')}\n\n${body}` : body;
            entries.push({
                id: `${wiName}::${uid}`,
                name: e.comment || `Entry ${uid}`,
                enabled: !e.disable,
                content,
                meta: readEntryMeta(e),
            });
        }
    } catch(e) { console.warn(`[${EXT}]`,e); }
    return entries;
}

// ── Characters ──────────────────────────────────────────────────
function listAllCharacters() {
    let arr=[];
    try { if(Array.isArray(characters)&&characters.length) arr=characters; } catch(e){}
    if (!arr.length) { try { arr=SillyTavern.getContext().characters||[]; } catch(e){} }
    if (!arr.length) {
        try {
            const blocks=document.querySelectorAll('#rm_print_characters_block .character_select');
            const items=[];
            blocks.forEach(el=>{
                const name=el.querySelector('.ch_name')?.textContent?.trim()||'';
                const avatar=el.getAttribute('avatar')||el.dataset.avatar||'';
                const id=avatar||el.getAttribute('chid')||el.dataset.chid||'';
                if(id&&name)items.push({id,name});
            });
            return items;
        } catch(e){}
    }
    // Use avatar filename as stable ID (survives array reindexing when characters are deleted)
    return arr
        .map((c,i)=>({ id: c?.avatar || `_idx${i}`, name: c?.name || c?.data?.name || `#${i}` }))
        .filter(c=>c.name);
}

// Find character array index given avatar filename (or fallback to number id)
function findCharIndex(avatarOrId) {
    if (!Array.isArray(characters)) return -1;
    // First try: match by avatar
    let idx = characters.findIndex(c => c?.avatar === avatarOrId);
    if (idx >= 0) return idx;
    // Fallback: if it's numeric (legacy behavior), treat as index
    const n = Number(avatarOrId);
    if (!Number.isNaN(n) && n >= 0 && n < characters.length) return n;
    return -1;
}

async function readCharCard(charIdOrAvatar) {
    const fields=[];
    try {
        const idx = findCharIndex(charIdOrAvatar);
        if (idx < 0) return fields;
        if (typeof unshallowCharacter==='function') {
            try { await unshallowCharacter(idx); } catch(e) {}
        }
        let char=null;
        if (Array.isArray(characters)&&characters[idx]) char=characters[idx];
        if (!char) char=SillyTavern.getContext().characters?.[idx];
        if (!char) return fields;
        const d=char.data||{};
        const add=(id,label,val)=>{ if(val&&String(val).trim()) fields.push({id,name:label,content:String(val),isChar:true}); };

        add('description',               '📄 Description',          d.description    || char.description);
        add('personality',               '🎭 Personality Summary',  d.personality    || char.personality);
        add('scenario',                  '🌐 Scenario',             d.scenario       || char.scenario);
        add('first_mes',                 '💬 First Greeting',       d.first_mes      || char.first_mes);
        add('mes_example',               '📝 Examples of Dialogue', d.mes_example    || char.mes_example);
        add('system_prompt',             '⚙️ System Prompt',        d.system_prompt);
        // Character's Note (inline injection) = extensions.depth_prompt.prompt
        const depthPrompt = d.extensions?.depth_prompt?.prompt || d.character_note || '';
        add('character_note',            "📌 Character's Note",     depthPrompt);
        add('post_history_instructions', '📌 Post History Instr.',  d.post_history_instructions);
        add('creator_notes',             '📋 Creator Notes',        d.creator_notes);
        const alts=d.alternate_greetings||char.alternate_greetings||[];
        alts.forEach((g,i)=>{ if(g&&String(g).trim()) fields.push({id:`alt_greeting_${i}`,name:`💬 Alternate Greeting ${i+1}`,content:String(g),isChar:true}); });
    } catch(e) { console.warn(`[${EXT}]`,e); }
    return fields;
}

// ── UI ────────────────────────────────────────────────────────────────
// Escapes text for safe insertion into both HTML text nodes and quoted
// attribute values. Quotes matter: prompt/entry names are placed into
// title="..." attributes, and an unescaped quote there would let a crafted
// name break out of the attribute.
const esc = s => (s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

// Search keyword highlight
function highlightText(html, keyword) {
    if (!keyword) return html;
    const safeK = keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return html.replace(new RegExp(`(${safeK})`, 'gi'), '<mark class="pt-highlight">$1</mark>');
}

function makeBlockItem(block, ns, selectable) {
    const el = PDOC.createElement('div');
    el.className = 'pt-block-item';
    el.dataset.id = block.id;
    const cached = getCached(ns, block.id);
    const tokens = estimateTokens(block.content||'');
    el.dataset.searchText = (block.name+' '+(block.content||'')+' '+(cached||'')).toLowerCase();

    // Use ST native FA link icon
    const clipBadge = block.isCustom
        ? `<span class="pt-clip-badge"><i class="fa-solid fa-link"></i></span>` : '';

    // Character cards: no ON/OFF badge
    const statusBadge = block.isChar
        ? ''
        : `<span class="pt-status-badge ${block.enabled!==false?'pt-status-on':'pt-status-off'}">${block.enabled!==false?'ON':'OFF'}</span>`;

    // Select-all checkbox when selectable
    const checkboxHtml = selectable ? `<input type="checkbox" class="pt-checkbox">` : '';

    // Compact metadata strip (world info only). Display-only, never translated.
    const m = block.meta;
    let metaHtml = '';
    if (m) {
        const dot = m.strategy === 'const' ? '🔵' : (m.strategy === 'vector' ? '🔗' : '🟢');
        const bits = [`${dot}`];
        if (m.position)             bits.push(`pos ${esc(m.position)}`);
        if (m.depth != null)        bits.push(`depth ${m.depth}`);
        if (m.order != null)        bits.push(`order ${m.order}`);
        if (m.probability != null && m.probability !== 100) bits.push(`trig ${m.probability}%`);
        metaHtml = `<div class="pt-block-meta">${bits.join('<span class="pt-meta-sep">·</span>')}</div>`;
    }

    el.innerHTML = `
        <div class="pt-block-header">
            ${checkboxHtml}
            ${statusBadge}
            <span class="pt-block-name" title="${esc(block.name)}">${esc(block.name)}</span>
            ${clipBadge}
            <span class="pt-token-count">${tokens}</span>
            <span class="pt-block-chevron">▶</span>
        </div>
        <div class="pt-block-body">
            ${metaHtml}
            <div class="pt-original-label">원문</div>
            <div class="pt-original-text">${esc(block.content||'')}</div>
            <div class="pt-translated-label">번역</div>
            <div class="pt-translated-text">${cached?esc(cached):'<span class="pt-no-trans">번역 전</span>'}</div>
        </div>`;

    el.querySelector('.pt-block-header').addEventListener('click', e => {
        if (e.target.classList.contains('pt-checkbox')) return;
        el.classList.toggle('expanded');
    });
    if (selectable) {
        el.querySelector('.pt-checkbox')?.addEventListener('change', ev => {
            el.classList.toggle('selected', ev.target.checked);
            const page = el.closest('.pt-page');
            if (page) updateSelectedCount(page);
        });
    }
    return el;
}

// Selected chip shows count + token sum
function updateSelectedCount(page) {
    const selectedItems = [...page.querySelectorAll('.pt-block-item.selected')];
    const count = selectedItems.length;
    const el = page.querySelector('.pt-selected-chip');
    if (!el) return;
    if (count > 0) {
        // 토큰 합계 계산
        const totalTkn = selectedItems.reduce((s, item) => {
            const tkEl = item.querySelector('.pt-token-count');
            return s + (parseInt(tkEl?.textContent || '0') || 0);
        }, 0);
        el.textContent = `선택: ${count}개  ${totalTkn.toLocaleString()} tkn`;
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

function setBlockHTML(list, id, htmlContent) {
    const item = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!item) return;
    const ta = item.querySelector('.pt-translated-text');
    if (ta) ta.innerHTML = htmlContent;
    if (typeof htmlContent === 'string') {
        // Always use the original name for search indexing.
        // When the 👀 toggle is ON, the displayed name may be the translated title,
        // but data-orig-name still holds the original — fall back to current text if absent.
        const namePart = item.dataset.origName || item.querySelector('.pt-block-name')?.textContent || '';
        const origPart = item.querySelector('.pt-original-text')?.textContent||'';
        const transPart = ta?.textContent||'';
        item.dataset.searchText = (namePart+' '+origPart+' '+transPart).toLowerCase();
    }
}

// ── Translation runner ─────────────────────────────────────────────────
async function runTranslation({ items, list, ns, pBar, pLabel, pWrap, btnStop, forceRetranslate }) {
    if (isBusy) return;
    isBusy=true; stopReq=false;
    const dot=PDOC.getElementById('pt-status-dot'), stTxt=PDOC.getElementById('pt-status-text');
    dot?.classList.add('busy');
    if (stTxt) stTxt.textContent = forceRetranslate?'재번역 중...':'번역 중...';
    pWrap.classList.add('visible');
    if (btnStop) btnStop.disabled=false;

    const selected=[...list.querySelectorAll('.pt-block-item.selected')].map(el=>el.dataset.id);
    const targets=selected.length?items.filter(b=>selected.includes(b.id)):items;
    const total=targets.length; let done=0;

    for (const b of targets) {
        if (stopReq) break;
        if (forceRetranslate) {
            const key = ck(ns, b.id);
            translationMap.delete(key);
            dbDelete(key);
        }
        const cached=forceRetranslate?null:getCached(ns,b.id);
        if (cached) {
            setBlockHTML(list,b.id,esc(cached));
        } else {
            setBlockHTML(list,b.id,'<span class="pt-translating">⟳ 번역 중...</span>');
            try {
                const nonce=forceRetranslate?Math.random().toString(36).slice(2,10):null;
                const res=await translateText(b.name,b.content,nonce);
                if (res) {
                    setBlockHTML(list,b.id,esc(res));
                    setCache(ns,b.id,res);
                    // Full translation is the newer action — retire the
                    // title-only entry so its title isn't stuck winning.
                    clearCachedTitle(ns,b.id);
                } else {
                    // Both name and content were empty — nothing to translate
                    setBlockHTML(list,b.id,'<span class="pt-no-trans">번역 전</span>');
                }
            } catch(err) {
                setBlockHTML(list,b.id,`<span style="color:#ef4444;font-size:11px;">❌ ${esc(err.message)}</span>`);
            }
        }
        done++;
        const pct=Math.round(done/total*100);
        pBar.style.width=pct+'%';
        pLabel.textContent=`${done} / ${total}  (${pct}%)`;
        if (!stopReq) await new Promise(r=>setTimeout(r, requestDelayMs()));
    }
    // (translations now persist to IndexedDB automatically via setCache/dbDelete)
    try { updateCacheStatsUI(); } catch(e) {}
    isBusy=false;
    dot?.classList.remove('busy');
    if (stTxt) stTxt.textContent=stopReq?'중단됨':(forceRetranslate?'재번역 완료 ✓':'번역 완료 ✓');
    pWrap.classList.remove('visible');
    if (btnStop) btnStop.disabled=true;
    setTimeout(()=>{const t=PDOC.getElementById('pt-status-text');if(t)t.textContent='대기 중';},3000);
}

// ── Export Module (Plus) ────────────────────────────────────

// Sanitize filename: remove forbidden chars but keep unicode (Korean/Chinese OK)
function sanitizeFilename(name) {
    return String(name || 'untitled')
        .replace(/[\/\\:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

// Trigger browser download of a Blob
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// Show a 3-choice modal inside our panel (Original / Translated / Both)
// Returns a Promise resolving to 'original' | 'translated' | 'both' | null
// Generic N-choice modal. opts = [{ v:'value', label:'표시 텍스트' }, ...]
// Resolves to the chosen value, or null if cancelled / dismissed.
function askChoice(title, opts) {
    return new Promise(resolve => {
        const existing = PDOC.getElementById('pt-choice-modal');
        if (existing) existing.remove();

        const backdrop = PDOC.createElement('div');
        backdrop.id = 'pt-choice-modal';
        backdrop.className = 'pt-choice-backdrop';
        backdrop.innerHTML = `
          <div class="pt-choice-box" role="dialog" aria-modal="true">
            <div class="pt-choice-title">${esc(title)}</div>
            <div class="pt-choice-btns">
              ${opts.map(o => `<button type="button" data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}
            </div>
            <div class="pt-choice-cancel"><button type="button" data-v="__cancel__">취소</button></div>
          </div>`;
        const panel = PDOC.getElementById('pt-panel');
        (panel || PDOC.body).appendChild(backdrop);

        const close = (val) => { backdrop.remove(); resolve(val); };
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) return close(null);
            const btn = e.target.closest('button[data-v]');
            if (!btn) return;
            const v = btn.dataset.v;
            close(v === '__cancel__' ? null : v);
        });
    });
}

function askTextChoice(title) {
    return new Promise(resolve => {
        const existing = PDOC.getElementById('pt-choice-modal');
        if (existing) existing.remove();

        const backdrop = PDOC.createElement('div');
        backdrop.id = 'pt-choice-modal';
        backdrop.className = 'pt-choice-backdrop';
        backdrop.innerHTML = `
          <div class="pt-choice-box" role="dialog" aria-modal="true">
            <div class="pt-choice-title">${esc(title)}</div>
            <div class="pt-choice-btns">
              <button type="button" data-v="original">원문만</button>
              <button type="button" data-v="translated">번역문만</button>
              <button type="button" data-v="both">둘 다</button>
            </div>
            <div class="pt-choice-cancel"><button type="button" data-v="cancel">취소</button></div>
          </div>`;
        // mount to panel if exists, else body
        const panel = PDOC.getElementById('pt-panel');
        (panel || PDOC.body).appendChild(backdrop);

        const close = (val) => { backdrop.remove(); resolve(val); };
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop) close(null); // click outside = cancel
            const btn = e.target.closest('button[data-v]');
            if (!btn) return;
            const v = btn.dataset.v;
            close(v === 'cancel' ? null : v);
        });
    });
}

// Format text for export/copy according to choice
function formatItemsAsText(items, choice) {
    const out = [];
    for (const it of items) {
        const original   = (it.content || '').trim();
        const translated = (getCached(it._ns, it.id) || '').trim();
        const name = it.name || it.id || '';

        if (choice === 'original') {
            out.push(`━━━ ${name} ━━━\n${original}`);
        } else if (choice === 'translated') {
            out.push(`━━━ ${name} ━━━\n${translated || '(번역없음)'}`);
        } else { // both
            const t = translated || '(번역없음)';
            out.push(`━━━ ${name} ━━━\n[원문]\n${original}\n\n[번역]\n${t}`);
        }
    }
    return out.join('\n\n');
}

// Copy text to clipboard with fallback
async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch(e) {}
    // fallback
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch(e) { return false; }
}

// Deep clone via structured JSON (ST data is JSON-safe)
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Get translation for a given namespace + id (returns null if not translated)
function getTranslated(ns, id) {
    return getCached(ns, id);
}

// Split a translated content into { title, body }.
// During translation we prepend "### {title}\n\n" so the model also translates
// the toggle/entry name. The model output may include markdown separators (---)
// before/around the heading, so we scan the first few non-empty lines for the
// first markdown heading and treat everything before it as discardable preamble.
function splitTitleAndBody(translated) {
    if (typeof translated !== 'string' || !translated) return { title: null, body: translated || '' };

    const lines = translated.split(/\r?\n/);
    let scanned = 0;
    for (let i = 0; i < lines.length && scanned < 5; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === '') continue; // skip leading blank lines
        scanned++;
        // Skip horizontal-rule separators (--- *** ___) that the model sometimes emits
        if (/^([-*_]){3,}$/.test(trimmed)) continue;
        // Match a markdown heading line
        const m = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
        if (m) {
            const title = m[1].trim();
            // Body = everything after this heading line, with leading blank lines stripped
            let body = lines.slice(i + 1).join('\n');
            body = body.replace(/^(\s*\r?\n)+/, '');
            return { title, body };
        }
        // Hit a non-heading content line — no title prefix detected
        break;
    }
    return { title: null, body: translated };
}

// Helper used by JSON exporters: returns the translated body (without the prepended title line).
// If no translation exists, returns null.
function getTranslatedBody(ns, id) {
    const t = getTranslated(ns, id);
    if (!t) return null;
    return splitTitleAndBody(t).body;
}

// Helper: returns only the translated title (or null if not found in the translation)
function getTranslatedTitle(ns, id) {
    // Precedence: the title-only cache wins when present.
    // It is only ever written by an explicit "제목만" action (which skips
    // items that already have a title, unless the user confirms a redo),
    // so its presence always reflects a deliberate user choice — including
    // a redo meant to override a bad title from a full translation.
    const only = getCachedTitle(ns, id);
    if (only && only.trim()) return only.trim();

    // Otherwise use the title embedded in a full translation.
    const t = getTranslated(ns, id);
    if (t) {
        const title = splitTitleAndBody(t).title;
        if (title) return title;
    }
    return null;
}

// ── JSON Export: Preset ───────────────────────────────────────────────
// Returns ST-compatible preset JSON with translated toggle contents.
// Strips API connection/endpoint settings (they shouldn't be shared with translations).
// ── JS-Slash-Runner script export (preset titles) ─────────────────────
// Builds a script that renames prompt-manager entries in ST's own UI to the
// translated titles. It only rewrites what is displayed — the preset itself
// is never touched, and disabling the script in JS Runner fully reverts it.
//
// Matching is by exact name string. We deliberately do NOT include a
// substring-matching fallback: with entries like "NSFW" and "NSFW 기초"
// present, fuzzy matching silently assigns the wrong translation.
function buildTitleScriptContent(label, mapping, kind) {
    const json = JSON.stringify(mapping, null, 2);

    if (kind === 'wi') {
        // World Info entry titles live inside <input>/<textarea> elements in ST's
        // World Info editor. Writing to their .value would fire ST's change
        // handlers and could persist the translated title into the user's actual
        // world info data. So this script NEVER touches input values — it only
        // appends a separate hint element next to the field. Removing the script
        // (or reloading) leaves the data untouched.
        return `/**
 * World Info Title Hints — ${label}
 * Generated by Prompt Panel.
 *
 * Shows a translated title next to each World Info entry name.
 *
 * SAFETY: this script never writes to any input/textarea value. It only
 * inserts read-only hint elements, so your world info data is never modified.
 *
 * Note: this relies on SillyTavern's internal DOM (world info editor markup).
 * A future SillyTavern update could change those selectors and stop this
 * script from taking effect. It will fail silently, never destructively.
 */

const TRANSLATIONS = ${json};

const targetDoc = parent.document || document;
const HINT_CLASS = "ppt-wi-hint";

// Minimal CSS.escape fallback for the attribute selector below.
function cssEscape(v) {
  const str = String(v == null ? "" : v);
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(str);
  return str.replace(/["\\\]]/g, "\\$&");
}

// Exact match only — no substring fallback.
function findTranslation(original) {
  if (!original) return null;
  return Object.prototype.hasOwnProperty.call(TRANSLATIONS, original)
    ? TRANSLATIONS[original]
    : null;
}

function injectStyle() {
  const STYLE_ID = "ppt-wi-hint-style";
  if (targetDoc.getElementById(STYLE_ID)) return;
  const style = targetDoc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = \`
    .\${HINT_CLASS} {
      display: block;
      width: 100%;
      flex: 0 0 100%;
      margin: 0 0 2px 0;
      font-size: 0.85em;
      line-height: 1.3;
      opacity: 0.7;
      pointer-events: none;
      overflow-wrap: anywhere;
    }
  \`;
  targetDoc.head.appendChild(style);
}

// Candidate selectors for the entry title field, tried in order.
const TITLE_FIELD_SELECTORS = [
  'input[name="comment"]',
  'textarea[name="comment"]',
  '.world_entry_form_control input[name="comment"]',
];

function applyHints() {
  const seen = new Set();
  for (const sel of TITLE_FIELD_SELECTORS) {
    targetDoc.querySelectorAll(sel).forEach((field) => {
      if (seen.has(field)) return;
      seen.add(field);

      // Read only. Never assign to field.value.
      const original = (field.value || "").trim();
      const translated = findTranslation(original);

      // Where the hint goes is decided by measurement, not by guessing at CSS.
      // We insert it before the field, then check whether it actually landed on
      // its own line. If it is still sharing a line (flex/grid row, float, etc.)
      // we lift it one level up and re-check, a few times. This adapts to any
      // layout without ever modifying SillyTavern's own styles.
      let hint = targetDoc.querySelector('[data-ppt-for="' + cssEscape(original) + '"]');
      if (hint && !hint.isConnected) hint = null;

      if (!translated) {
        if (hint) hint.remove();
        return;
      }
      if (!hint) {
        hint = targetDoc.createElement("div");
        hint.className = HINT_CLASS;
        hint.setAttribute("data-ppt-for", original);
      }

      const sharesLine = () => {
        try {
          const h = hint.getBoundingClientRect();
          const f = field.getBoundingClientRect();
          if (!h.height || !f.height) return false;
          // Overlapping vertical ranges means they render side by side.
          return h.bottom > f.top + 1 && h.top < f.bottom - 1;
        } catch (e) { return false; }
      };

      // Steady state must not touch the DOM at all: re-inserting a node that
      // is already in place still counts as a mutation, which would wake the
      // MutationObserver and loop forever. So only move the hint if it is not
      // connected yet, or if it is currently sharing a line with the field.
      if (hint.isConnected && !sharesLine()) {
        if (hint.textContent !== "→ " + translated) hint.textContent = "→ " + translated;
        return;
      }

      let anchor = field;
      if (!hint.isConnected || hint.nextElementSibling !== anchor) {
        anchor.insertAdjacentElement("beforebegin", hint);
      }
      for (let i = 0; i < 4 && sharesLine(); i++) {
        const parent = anchor.parentElement;
        if (!parent || parent === targetDoc.body) break;
        anchor = parent;
        anchor.insertAdjacentElement("beforebegin", hint);
      }

      const text = "→ " + translated;
      if (hint.textContent !== text) hint.textContent = text;
    });
  }
}

let rafId = null;
function scheduleApply() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    // Detach while we mutate so our own insertions can never re-trigger us.
    observer.disconnect();
    try {
      applyHints();
    } finally {
      observer.observe(targetDoc.body, { childList: true, subtree: true });
    }
  });
}

const observer = new MutationObserver(scheduleApply);

function init() {
  injectStyle();
  observer.observe(targetDoc.body, { childList: true, subtree: true });
  applyHints();
}

if (targetDoc.readyState === "loading") {
  targetDoc.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
`;
    }

    return `/**
 * Prompt Name Translator — ${label}
 * Generated by Prompt Panel.
 *
 * Renames prompt entries in SillyTavern's prompt manager UI to their
 * translated titles. Display only — the preset data is never modified.
 * Disable this script in JS Runner to restore the original names.
 *
 * Note: this relies on SillyTavern's internal DOM (prompt manager markup).
 * A future SillyTavern update could change those selectors and stop this
 * script from taking effect.
 */

const TRANSLATIONS = ${json};

const targetDoc = parent.document || document;

// Exact match only — no substring fallback (see header note).
function findTranslation(original) {
  if (!original) return null;
  return Object.prototype.hasOwnProperty.call(TRANSLATIONS, original)
    ? TRANSLATIONS[original]
    : null;
}

let rafId = null;
function scheduleApply() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => { rafId = null; applyAllTranslations(); });
}

// Prompt list entries
function applyListTranslations() {
  targetDoc.querySelectorAll("a.prompt-manager-inspect-action").forEach((el) => {
    const original = el.getAttribute("title") || "";
    if (!original) return;
    const translated = findTranslation(original);
    if (!translated) return;
    if (el.textContent === translated) return;
    el.textContent = translated;
  });
}

// "Add prompt" dropdown at the bottom of the prompt manager
const SELECT_ID = "completion_prompt_manager_footer_append_prompt";
function applySelectTranslations() {
  const select = targetDoc.getElementById(SELECT_ID);
  if (!select) return;
  select.querySelectorAll("option").forEach((option) => {
    const original = option.dataset.pptOriginal ?? option.textContent.trim();
    if (!option.dataset.pptOriginal) option.dataset.pptOriginal = original;
    const translated = findTranslation(original);
    if (!translated) return;
    if (option.textContent === translated) return;
    option.textContent = translated;
  });
}

function applyAllTranslations() {
  applyListTranslations();
  applySelectTranslations();
}

const observer = new MutationObserver(scheduleApply);

function init() {
  observer.observe(targetDoc.body, { childList: true, subtree: true });
  applyAllTranslations();
}

if (targetDoc.readyState === "loading") {
  targetDoc.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
`;
}

// kind: 'preset' | 'wi'
function exportTitleScript(kind, srcName, items, ns) {
    let targetName = srcName;
    if (kind === 'preset' && (srcName === '__cur__' || !srcName)) {
        targetName = oai_settings?.preset_settings_openai || '';
    }

    const mapping = {};
    let skipped = 0;
    for (const b of (items || [])) {
        const original = (b.name || '').trim();
        if (!original) continue;
        const translated = getTranslatedTitle(ns, b.id);
        if (!translated || translated === original) { skipped++; continue; }
        // Duplicate original names collapse into one entry — unavoidable,
        // since the generated script matches on the displayed name.
        mapping[original] = translated;
    }

    const count = Object.keys(mapping).length;
    if (!count) {
        throw new Error('번역된 제목이 없습니다. 먼저 번역 또는 "제목만" 번역을 실행하세요.');
    }

    const label = targetName || (kind === 'wi' ? 'World Info' : 'Preset');
    const content = buildTitleScriptContent(label, mapping, kind);

    let uuid;
    try { uuid = crypto.randomUUID(); }
    catch (e) { uuid = 'ppt-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 10); }

    const data = {
        type: 'script',
        enabled: true,
        name: `(제목번역) ${label}`,
        id: uuid,
        content,
        info: `Prompt Panel이 생성한 제목 번역 스크립트 (${count}개 항목, ${effLang()})`,
        button: { enabled: true, buttons: [] },
        data: {},
    };

    return {
        data,
        filename: `${sanitizeFilename(label)}_titles_${effLang()}_jsrunner.json`,
        count,
        skipped,
    };
}

function exportPresetJSON(presetName) {
    const targetName = presetName === '__cur__' || !presetName
        ? (oai_settings?.preset_settings_openai || '')
        : presetName;
    if (!targetName) throw new Error('프리셋을 찾을 수 없습니다');

    // Match readPresetBlocks(): for the preset that is currently loaded, ST's
    // live working state lives in oai_settings, while openai_settings[] holds
    // the last *saved* copy. Reading from different sources would let the panel
    // show edited content while the export wrote the stale saved version.
    const cur = getCurrentPresetName();
    let presetObj;
    if (targetName === cur) {
        presetObj = oai_settings;
    } else {
        const presetIndex = openai_setting_names?.[targetName];
        presetObj = presetIndex !== undefined ? openai_settings[presetIndex] : null;
    }
    if (!presetObj) throw new Error('프리셋 객체를 찾을 수 없습니다');

    const cloned = deepClone(presetObj);
    const ns = `pt-preset::${presetName || '__cur__'}`;

    // Strip API connection / endpoint / credential fields.
    // These are machine-specific and may include secrets; they should never be
    // embedded in a translated preset file meant for sharing.
    const STRIP_KEYS = [
        'custom_url', 'custom_model', 'custom_include_body', 'custom_exclude_body',
        'custom_include_headers', 'custom_prompt_post_processing',
        'reverse_proxy', 'proxy_password',
        'vertexai_region', 'vertexai_auth_mode', 'vertexai_express_project_id',
        'vertexai_template', 'vertexai_model',
        'openrouter_model', 'openrouter_use_fallback', 'openrouter_group_models',
        'openrouter_sort_models', 'openrouter_providers', 'openrouter_allow_fallbacks',
        'openrouter_middleout', 'openrouter_api_key',
        'openai_model', 'claude_model', 'google_model', 'ai21_model', 'mistralai_model',
        'cohere_model', 'perplexity_model', 'groq_model', 'deepseek_model',
        'zerooneai_model', 'nanogpt_model', 'blockentropy_model', 'xai_model',
        'chat_completion_source',
        'api_url_scale', 'bypass_status_check',
    ];
    for (const k of STRIP_KEYS) delete cloned[k];

    // Also strip the entire connection profile if present
    if (cloned.connection_profile) delete cloned.connection_profile;

    // Note: extensions object is preserved (contains regex_scripts and other useful settings)

    // Replace prompt contents and names with translations where available
    if (Array.isArray(cloned.prompts)) {
        for (const p of cloned.prompts) {
            if (!p || !p.identifier) continue;
            const cached = getTranslated(ns, p.identifier);
            // Title may come from a title-only translation even when there is
            // no full translation, so resolve it independently of the body.
            const title = getTranslatedTitle(ns, p.identifier);
            if (title) p.name = title;
            if (!cached) continue;
            const { body } = splitTitleAndBody(cached);
            if (typeof body === 'string') p.content = body;
        }
    }
    return { data: cloned, filename: `${sanitizeFilename(targetName)}_${effLang()}.json` };
}

// ── JSON Export: World Info ───────────────────────────────────────────
// selectedIds: null = all entries, Set = only those entries (others stay original)
async function exportWorldInfoJSON(worldName, selectedIds) {
    const ctx = SillyTavern?.getContext?.() || getContext?.();
    if (!ctx?.loadWorldInfo) throw new Error('WI 로드 함수를 찾을 수 없습니다');
    const wi = await ctx.loadWorldInfo(worldName);
    if (!wi || !wi.entries) throw new Error('WI 데이터를 찾을 수 없습니다');

    const cloned = deepClone(wi);
    const ns = `pt-wi::${worldName}`;

    // ST's loadWorldInfo() sometimes attaches an `originalData` field that
    // contains a backup of all entries in the original (array) shape. This
    // field is NOT part of the standard WI export format and we must remove
    // it — otherwise filtered exports still contain the full original list,
    // and the file is bloated with duplicated content.
    if ('originalData' in cloned) delete cloned.originalData;

    // If partial selection, filter entries to only selected ones
    if (selectedIds instanceof Set && selectedIds.size > 0) {
        const filteredEntries = {};
        let kept = 0;
        for (const key of Object.keys(cloned.entries)) {
            const entry = cloned.entries[key];
            if (!entry) continue;
            // Try multiple id formats since uid could be number or string
            const candidates = [
                `${worldName}::${entry.uid}`,
                `${worldName}::${String(entry.uid)}`,
                `${worldName}::${key}`,
            ];
            if (candidates.some(c => selectedIds.has(c))) {
                filteredEntries[key] = entry;
                kept++;
            }
        }
        cloned.entries = filteredEntries;
        console.log(`[${EXT}] WI export: filtered ${kept}/${selectedIds.size} entries`);
    }

    // Apply translations (id format matches readWorldInfo: "{wiName}::{uid}")
    for (const key of Object.keys(cloned.entries)) {
        const entry = cloned.entries[key];
        if (!entry) continue;
        const entryId = `${worldName}::${entry.uid ?? key}`;
        const cached = getTranslated(ns, entryId);
        const title = getTranslatedTitle(ns, entryId);
        if (title) entry.comment = title;
        if (!cached) continue;
        const { body: afterTitle } = splitTitleAndBody(cached);
        const parsed = splitKeysAndBody(afterTitle);
        // Guard against false positives: only honour a marker line if the
        // original entry actually had that field. Otherwise a body that
        // genuinely starts with "**Keys:**" would be mis-read as metadata.
        const hadKeys    = Array.isArray(entry.key) && entry.key.length > 0;
        const hadFilters = Array.isArray(entry.keysecondary) && entry.keysecondary.length > 0;
        const keys    = hadKeys    ? parsed.keys    : null;
        const filters = hadFilters ? parsed.filters : null;
        // If a marker was parsed but the original had no such field, that line
        // was real content — put it back so nothing is lost.
        let body = parsed.body;
        if ((parsed.keys && !hadKeys) || (parsed.filters && !hadFilters)) body = afterTitle;
        if (typeof body === 'string') entry.content = body;

        const mergeList = (orig, added) => {
            const out = [], seen = new Set();
            for (const k of [...(Array.isArray(orig) ? orig : []), ...added]) {
                const v = String(k || '').trim();
                if (!v || seen.has(v)) continue;
                seen.add(v);
                out.push(v);
            }
            return out;
        };

        // Primary keys use "any one matches" semantics, so merging original and
        // translated terms is always safe and lets the entry fire either way.
        if (keys && keys.length) entry.key = mergeList(entry.key, keys);

        // Secondary keys depend on selectiveLogic (ST world_info_logic):
        //   0 AND_ANY  — any secondary matches      → merging is safe
        //   1 NOT_ALL  — blocked only if ALL match  → merging breaks the block
        //   2 NOT_ANY  — blocked if any match       → merging is safe (and desirable)
        //   3 AND_ALL  — ALL secondaries must match → merging kills the entry
        // For the two "ALL" logics, extra terms change the condition itself, so
        // we replace with the translated terms instead of merging. The exported
        // card is meant to be used in the target language, so the translated
        // terms are the ones that should apply.
        if (filters && filters.length) {
            const logic = Number(entry.selectiveLogic ?? 0);
            const isAllLogic = (logic === 1 || logic === 3);
            entry.keysecondary = isAllLogic ? filters.slice() : mergeList(entry.keysecondary, filters);
        }
    }
    return { data: cloned, filename: `${sanitizeFilename(worldName)}_${effLang()}.json` };
}

// ── JSON Export: Character Card ───────────────────────────────────────
// selectedIds: null = translate all fields, Set = only apply translation to those field ids
async function exportCharacterJSON(charIdRaw, opts, selectedIds) {
    let idx = -1;
    if (charIdRaw === '__cur__' || charIdRaw === undefined || charIdRaw === null || charIdRaw === '') {
        const ctx = SillyTavern?.getContext?.() || getContext?.();
        idx = ctx?.characterId !== undefined ? Number(ctx.characterId) : -1;
    } else {
        idx = findCharIndex(charIdRaw);
    }
    if (idx < 0 || !characters?.[idx]) throw new Error('캐릭터를 찾을 수 없습니다');

    try { await unshallowCharacter?.(idx); } catch(e) {}
    const char = characters[idx];
    if (!char) throw new Error('캐릭터 데이터 없음');

    const cloned = deepClone(char);

    // Namespace matches page load: pt-char::{avatar}
    const ns = `pt-char::${char.avatar || '_idx' + idx}`;

    // Strip ST runtime metadata (not part of proper character card export)
    const RUNTIME_KEYS = ['chat', 'chat_size', 'data_size', 'date_added', 'date_last_chat', 'json_data', 'shallow'];
    for (const k of RUNTIME_KEYS) delete cloned[k];

    const shouldApply = (fieldId) => !(selectedIds instanceof Set) || selectedIds.size === 0 || selectedIds.has(fieldId);
    const isPartial = selectedIds instanceof Set && selectedIds.size > 0;

    // V3 spec uses data.* as source of truth. V1 top-level fields are duplicates.
    // We write translations into V2 (data.*) only and clear V1 duplicates to keep file lean.
    const setV2 = (v2Key, value) => {
        if (value === undefined || value === null) return;
        if (cloned.data) cloned.data[v2Key] = value;
    };

    const mainFields = [
        'description', 'personality', 'scenario', 'first_mes', 'mes_example',
        'post_history_instructions', 'creator_notes',
    ];

    // Apply translations to V2; clear non-selected fields when partial selection is active
    for (const f of mainFields) {
        if (shouldApply(f)) {
            const t = getTranslatedBody(ns, f);
            if (t !== null) setV2(f, t);
        } else if (isPartial) {
            setV2(f, '');
        }
    }

    // Clear V1 duplicates (description, personality, etc. at top level)
    const V1_DUPLICATES = ['description', 'personality', 'scenario', 'first_mes', 'mes_example',
                           'post_history_instructions', 'creator_notes', 'system_prompt',
                           'creator', 'character_version'];
    for (const k of V1_DUPLICATES) {
        if (k in cloned) cloned[k] = '';
    }

    // Alternate greetings: V2 is source of truth
    const alts = cloned.data?.alternate_greetings || cloned.alternate_greetings || null;
    if (Array.isArray(alts)) {
        for (let i = 0; i < alts.length; i++) {
            const fieldId = `alt_greeting_${i}`;
            if (shouldApply(fieldId)) {
                const t = getTranslatedBody(ns, fieldId);
                if (t !== null) alts[i] = t;
            } else if (isPartial) {
                alts[i] = '';
            }
        }
        if (cloned.data) cloned.data.alternate_greetings = alts;
        if ('alternate_greetings' in cloned) cloned.alternate_greetings = [];
    }

    // Character's Note: V2 path only
    if (shouldApply('character_note')) {
        const noteT = getTranslatedBody(ns, 'character_note');
        if (noteT && cloned.data?.extensions?.depth_prompt) {
            cloned.data.extensions.depth_prompt.prompt = noteT;
        }
    } else if (isPartial && cloned.data?.extensions?.depth_prompt) {
        cloned.data.extensions.depth_prompt.prompt = '';
    }

    // system_prompt
    if (shouldApply('system_prompt')) {
        const t = getTranslatedBody(ns, 'system_prompt');
        if (t && cloned.data) cloned.data.system_prompt = t;
    } else if (isPartial && cloned.data) {
        cloned.data.system_prompt = '';
    }

    // Embedded character_book: option A — keep original. If excluded, remove ALL world link refs.
    if (opts && opts.includeCharacterBook === false) {
        // Remove the embedded book itself
        if (cloned.data?.character_book) delete cloned.data.character_book;
        if (cloned.character_book) delete cloned.character_book;
        // Remove world-info name references — ST auto-links a same-named world info on import,
        // which defeats the "exclude" intent.
        if (cloned.data?.extensions) {
            if ('world' in cloned.data.extensions) cloned.data.extensions.world = '';
        }
        if (cloned.extensions) {
            if ('world' in cloned.extensions) cloned.extensions.world = '';
        }
        // Some cards also carry a top-level reference
        if ('world' in cloned) cloned.world = '';
        if (cloned.data && 'world' in cloned.data) cloned.data.world = '';
    }

    const name = char.name || `character_${idx}`;
    return { data: cloned, filename: `${sanitizeFilename(name)}_${effLang()}.json` };
}

// ── Title-only translation (batched) ─────────────────────────────────
// Translates just the toggle/entry names, in batches, so a user can skim a
// large preset and decide what is worth translating in full.
//
// Safety notes:
//  - Results go to the title-only cache (titleNS), never to the main cache,
//    so a later full 번역 still runs normally and is never shadowed.
//  - Items that already have a translated title (full or title-only) are
//    skipped, so repeat presses cost nothing and never overwrite good data.
//  - Parsing is strict: a batch whose reply doesn't line up 1:1 is discarded
//    wholesale rather than risk assigning titles to the wrong toggles.
// Batch size and inter-request delay are user-configurable (extension drawer).
const titleBatchSize  = () => Math.max(1, Math.min(50, cfg().titleBatchSize || 15));
const requestDelayMs  = () => Math.max(0, cfg().requestDelayMs ?? 60);

function parseNumberedTitles(raw, expectedCount) {
    if (typeof raw !== 'string') return null;
    const found = new Map();
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*(\d+)\s*[.):\]]\s*(.+?)\s*$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        let val = m[2].trim();
        // Strip stray markdown emphasis/heading the model may add
        val = val.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim();
        if (!val) continue;
        if (idx >= 1 && idx <= expectedCount && !found.has(idx)) found.set(idx, val);
    }
    // Require a complete, unambiguous mapping
    if (found.size !== expectedCount) return null;
    const out = [];
    for (let i = 1; i <= expectedCount; i++) out.push(found.get(i));
    return out;
}

async function translateTitleBatch(names) {
    const lang = effLang();
    const numbered = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
    const prompt =
`Translate each of the following ${names.length} short labels into ${lang}.

RULES:
1. These are UI labels / section titles from a chat-AI prompt preset. Keep them short and label-like.
2. Do NOT translate: {{char}}, {{user}}, {{getvar::*}}, {{setvar::*}}, {{random::*}}, code identifiers, URLs.
3. Preserve any leading emoji or symbols exactly as they appear.
4. Do NOT alter references to languages, nationalities, cultures, or styles. Translate such words literally.
5. Output EXACTLY ${names.length} lines, each formatted as "<number>. <translation>", in the same order and numbering as the input.
6. Output ONLY those lines — no preamble, no commentary, no blank lines between items.
7. Never echo a label back unchanged. Even if a label is already close to ${lang}, produce a proper ${lang} rendering.

--- LABELS ---
${numbered}
--- END ---

Now output the ${names.length} numbered lines, translated into ${lang}.`;

    const c = cfg();
    const prov = c.provider || 'openai';
    const source = PROVIDER_TO_SOURCE[prov] || prov;
    const model = (c.model === '__custom__' ? (c.customModelName || '') : (c.model || '')) || '';

    const messages = [{ role: 'user', content: prompt }];
    if (c.prefillEnabled && c.prefillText?.trim()) {
        const role = (source === 'makersuite' || source === 'google' || source === 'vertexai') ? 'model' : 'assistant';
        messages.push({ role, content: c.prefillText.trim() });
    }

    const { params } = getCurrentParams();
    const providerParams = getProviderSpecificParams(prov, params);
    const parameters = { model, messages, stream: false, chat_completion_source: source, ...providerParams };
    if (source === 'vertexai') {
        parameters.vertexai_auth_mode = oai_settings?.vertexai_auth_mode || 'full';
        const region = oai_settings?.vertexai_region;
        if (region) parameters.vertexai_region = region;
        if (parameters.vertexai_auth_mode === 'express' && oai_settings?.vertexai_express_project_id) {
            parameters.vertexai_express_project_id = oai_settings.vertexai_express_project_id;
        }
    }
    if (c.useReverseProxy && c.reverseProxyUrl?.trim()) {
        parameters.reverse_proxy = c.reverseProxyUrl.trim();
        parameters.proxy_password = c.reverseProxyPassword || '';
    }

    const resp = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(parameters),
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const d = await resp.json();
    let result = d.choices?.[0]?.message?.content?.trim()
        || d.content?.[0]?.text?.trim()
        || d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return parseNumberedTitles(result, names.length);
}

async function runTitleTranslation({ items, list, ns, pBar, pLabel, pWrap, btnStop, onDone }) {
    if (isBusy) return;

    // Respect selection; otherwise operate on everything loaded.
    const selected = [...list.querySelectorAll('.pt-block-item.selected')].map(el => el.dataset.id);
    const scoped = selected.length ? items.filter(b => selected.includes(b.id)) : items;

    // Split into "needs translation" and "already has a translated title".
    const named = scoped.filter(b => b.name && b.name.trim());
    const fresh = named.filter(b => !getTranslatedTitle(ns, b.id));
    const already = named.filter(b => getTranslatedTitle(ns, b.id));

    let targets = fresh;
    if (!fresh.length) {
        if (!already.length) {
            if (typeof toastr !== 'undefined') toastr.info('번역할 제목이 없습니다');
            return;
        }
        // Everything already has a title — offer a redo rather than refusing.
        const redo = confirm(
            `제목 ${already.length}개가 이미 번역되어 있습니다.\n\n다시 번역할까요?\n\n[확인] = 재번역 (기존 제목 번역을 덮어씀)\n[취소] = 아무것도 하지 않음\n\n※ 본문 번역 데이터는 영향을 받지 않습니다.`
        );
        if (!redo) return;
        targets = already;
    }

    if (!targets.length) {
        if (typeof toastr !== 'undefined') toastr.info('번역할 제목이 없습니다');
        return;
    }

    isBusy = true; stopReq = false;
    const dot = PDOC.getElementById('pt-status-dot'), stTxt = PDOC.getElementById('pt-status-text');
    dot?.classList.add('busy');
    if (stTxt) stTxt.textContent = '제목 번역 중...';
    pWrap.classList.add('visible');
    if (btnStop) btnStop.disabled = false;

    const batches = [];
    const bs = titleBatchSize();
    for (let i = 0; i < targets.length; i += bs) {
        batches.push(targets.slice(i, i + bs));
    }

    let done = 0, okCount = 0, failCount = 0;
    for (const batch of batches) {
        if (stopReq) break;
        try {
            const translated = await translateTitleBatch(batch.map(b => b.name));
            if (translated) {
                batch.forEach((b, i) => { setCacheTitle(ns, b.id, translated[i]); });
                okCount += batch.length;
            } else {
                // Ambiguous reply — discard this batch instead of guessing.
                failCount += batch.length;
                console.warn(`[${EXT}] title batch discarded (reply did not match ${batch.length} items)`);
            }
        } catch (err) {
            failCount += batch.length;
            console.warn(`[${EXT}] title batch failed`, err);
        }
        done += batch.length;
        const pct = Math.round(done / targets.length * 100);
        pBar.style.width = pct + '%';
        pLabel.textContent = `${done} / ${targets.length}  (${pct}%)`;
        if (!stopReq) await new Promise(r => setTimeout(r, requestDelayMs()));
    }

    try { updateCacheStatsUI(); } catch (e) {}
    isBusy = false;
    dot?.classList.remove('busy');
    pWrap.classList.remove('visible');
    if (btnStop) btnStop.disabled = true;
    if (stTxt) stTxt.textContent = stopReq ? '중단됨' : '제목 번역 완료 ✓';
    setTimeout(() => { const t = PDOC.getElementById('pt-status-text'); if (t) t.textContent = '대기 중'; }, 3000);

    if (typeof toastr !== 'undefined') {
        if (failCount) toastr.warning(`제목 ${okCount}개 번역 완료, ${failCount}개 실패`);
        else toastr.success(`제목 ${okCount}개 번역 완료`);
    }
    if (typeof onDone === 'function') onDone();
}

// ── Page factory ──────────────────────────────────────────────────────
function buildPage({ page, idPfx, listFn, loadFn, selectable, icon, hint, isAsync, kind }) {
    let items=[], ns='';

    // Buttons + search on same row
    page.innerHTML = `
        <div class="pt-page-fixed">
            <div class="pt-toolbar">
                <select class="pt-select" id="${idPfx}-sel"><option value="">— 선택 —</option></select>
                <button class="pt-btn pt-btn-secondary" id="${idPfx}-load">📂 로드</button>
                <div class="pt-export-group">
                    <button class="pt-btn-icon" id="${idPfx}-copy" title="복사"><i class="fa-solid fa-copy"></i></button>
                    <button class="pt-btn-icon" id="${idPfx}-txt" title="TXT 내보내기"><i class="fa-solid fa-file-lines"></i></button>
                    <button class="pt-btn-icon" id="${idPfx}-json" title="JSON 내보내기"><i class="fa-solid fa-file-code"></i></button>
                </div>
            </div>
            <div class="pt-progress-wrap" id="${idPfx}-prog">
                <div class="pt-progress-bar-outer"><div class="pt-progress-bar-inner" id="${idPfx}-pbar"></div></div>
                <div class="pt-progress-label" id="${idPfx}-plbl"></div>
            </div>
            <div class="pt-controls" id="${idPfx}-ctrl" style="display:none;">
                <div class="pt-controls-scroll">
                    <button class="pt-btn pt-btn-primary" id="${idPfx}-trans">✦ 번역</button>
                    <button class="pt-btn pt-btn-retr"    id="${idPfx}-retr">↺ 재번역</button>
                    <button class="pt-btn pt-btn-title"   id="${idPfx}-titles" title="제목만 빠르게 번역 (본문은 그대로)">📛 제목</button>
                    <button class="pt-btn pt-btn-stop"    id="${idPfx}-stop" disabled>■ 중단</button>
                    <button class="pt-btn pt-btn-danger"  id="${idPfx}-clr" title="번역 캐시 비우기">🗑</button>
                    <button class="pt-btn-icon pt-btn-eye" id="${idPfx}-eye" title="토글 제목을 번역본으로 보기 (다시 누르면 원어로)" aria-pressed="false">👀</button>
                </div>
                <input type="text" class="pt-search" id="${idPfx}-search" placeholder="🔍 검색">
            </div>
            ${selectable ? `<div class="pt-select-row" id="${idPfx}-sarow" style="display:none;">
                <input type="checkbox" class="pt-checkbox" id="${idPfx}-allcb">
                <span class="pt-info-chip" id="${idPfx}-cnt"></span>
                <span class="pt-selected-chip" style="display:none;"></span>
            </div>` : `<div class="pt-select-row" id="${idPfx}-sarow" style="display:none;">
                <span class="pt-info-chip" id="${idPfx}-cnt"></span>
            </div>`}
        </div>
        <div class="pt-page-scroll">
            <div class="pt-block-list" id="${idPfx}-list"></div>
            <div class="pt-empty" id="${idPfx}-empty">
                <div class="pt-empty-icon">${icon}</div>
                <p id="${idPfx}-emptymsg">${hint}</p>
            </div>
        </div>`;

    const sel=page.querySelector(`#${idPfx}-sel`), list=page.querySelector(`#${idPfx}-list`);
    const ctrl=page.querySelector(`#${idPfx}-ctrl`), saRow=page.querySelector(`#${idPfx}-sarow`);
    const pWrap=page.querySelector(`#${idPfx}-prog`), pBar=page.querySelector(`#${idPfx}-pbar`), pLabel=page.querySelector(`#${idPfx}-plbl`);
    const empty=page.querySelector(`#${idPfx}-empty`), emptyP=page.querySelector(`#${idPfx}-emptymsg`);
    const btnStop=page.querySelector(`#${idPfx}-stop`), searchEl=page.querySelector(`#${idPfx}-search`);
    const eyeBtn = page.querySelector(`#${idPfx}-eye`);

    // ── 👀 Toggle title language (display-only, does not modify cache) ──
    // When ON: each block's name shows the translated title (if available).
    // When OFF (default): each block's name shows the original.
    // - data-orig-name attribute is saved on first toggle so we can always restore.
    // - Translated title comes from getTranslatedTitle(ns, id) which reads
    //   the first markdown heading line of the cached translation. If a
    //   translation has no heading, the original name is shown.
    // - Re-translation updates the cache; the next applyEyeMode call will pick
    //   up the new translated title automatically (we always re-read from cache).
    let _eyeOn = false;
    const applyEyeMode = () => {
        list.querySelectorAll('.pt-block-item').forEach(item => {
            const id = item.dataset.id;
            if (!id) return;
            const nameEl = item.querySelector('.pt-block-name');
            if (!nameEl) return;
            // Save original on first use
            if (!item.dataset.origName) {
                item.dataset.origName = nameEl.textContent || '';
            }
            if (_eyeOn) {
                const tTitle = getTranslatedTitle(ns, id);
                nameEl.textContent = tTitle || item.dataset.origName;
            } else {
                nameEl.textContent = item.dataset.origName;
            }
            // title attribute (hover tooltip) intentionally left as the original
        });
    };
    eyeBtn?.addEventListener('click', () => {
        _eyeOn = !_eyeOn;
        eyeBtn.setAttribute('aria-pressed', _eyeOn ? 'true' : 'false');
        eyeBtn.classList.toggle('pt-eye-on', _eyeOn);
        applyEyeMode();
    });

    const showEmpty = msg => { empty.style.display=''; if(msg)emptyP.textContent=msg; ctrl.style.display='none'; if(saRow)saRow.style.display='none'; };
    const hideEmpty = () => { empty.style.display='none'; ctrl.style.display=''; if(saRow)saRow.style.display=''; };
    showEmpty(hint);

    const refillSelect = async () => {
        sel.innerHTML='<option value="">— 선택 —</option>';
        const opts=isAsync?await listFn():listFn();
        opts.forEach(item=>{ const o=PDOC.createElement('option'); o.value=item.id; o.textContent=item.name; sel.appendChild(o); });
    };
    refillSelect();
    if (idPfx==='pt-char') {
        try { eventSource?.on?.(event_types?.APP_READY, refillSelect); } catch(e){}
        setTimeout(refillSelect,1500); setTimeout(refillSelect,4000);
    }

    page.querySelector(`#${idPfx}-load`).addEventListener('click', async () => {
        const val=sel.value;
        // Character tab: require explicit selection (no implicit "current character" fallback)
        if (kind === 'char' && !val) {
            showEmpty('불러올 데이터가 없습니다.');
            return;
        }
        ns=`${idPfx}::${val||'__cur__'}`;
        showEmpty('로딩 중...');
        items=isAsync?await loadFn(val):await loadFn(val);
        list.innerHTML='';

        // 선택 상태 완전 초기화 (프리셋 변경 시 이전 선택이 남지 않도록)
        const allCb = page.querySelector(`#${idPfx}-allcb`);
        if (allCb) allCb.checked = false;
        const selChip = page.querySelector('.pt-selected-chip');
        if (selChip) { selChip.style.display = 'none'; selChip.textContent = ''; }

        if (!items.length) { showEmpty('불러올 데이터가 없습니다.'); return; }
        hideEmpty();
        const totalTkn=items.reduce((s,i)=>s+estimateTokens(i.content||''),0);
        const cntEl=page.querySelector(`#${idPfx}-cnt`);
        if (cntEl) cntEl.textContent=`📊 ${items.length}개 · ${totalTkn.toLocaleString()} tkn`;
        let i=0;
        const renderChunk=()=>{
            const end=Math.min(i+50,items.length), frag=PDOC.createDocumentFragment();
            for(;i<end;i++) frag.appendChild(makeBlockItem(items[i],ns,selectable));
            list.appendChild(frag);
            if(i<items.length) requestAnimationFrame(renderChunk);
            else {
                if(searchEl)searchEl.value='';
                updateSelectedCount(page);
                // Re-apply eye-mode to freshly rendered items if currently ON
                applyEyeMode();
            }
        };
        renderChunk();
    });

    // Search with highlight
    let searchTimeout = null;
    searchEl?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const q=searchEl.value.trim().toLowerCase();
            list.querySelectorAll('.pt-block-item').forEach(el=>{
                if (!q) {
                    el.style.display='';
                    // 하이라이트 제거
                    el.querySelectorAll('.pt-original-text,.pt-translated-text').forEach(box=>{
                        if (box.dataset.origHtml) { box.innerHTML=box.dataset.origHtml; delete box.dataset.origHtml; }
                    });
                } else {
                    const match=el.dataset.searchText.includes(q);
                    el.style.display=match?'':'none';
                    if (match) {
                        // 하이라이트 적용
                        el.querySelectorAll('.pt-original-text,.pt-translated-text').forEach(box=>{
                            if (!box.dataset.origHtml) box.dataset.origHtml=box.innerHTML;
                            box.innerHTML=highlightText(box.dataset.origHtml, q);
                        });
                    }
                }
            });
        }, 120);
    });

    page.querySelector(`#${idPfx}-allcb`)?.addEventListener('change', ev => {
        list.querySelectorAll('.pt-block-item').forEach(item=>{
            if (item.style.display==='none') return;
            const cb=item.querySelector('.pt-checkbox');
            if (cb) { cb.checked=ev.target.checked; item.classList.toggle('selected',ev.target.checked); }
        });
        updateSelectedCount(page);
    });

    const mkArgs=force=>({items,list,ns,pBar,pLabel,pWrap,btnStop,forceRetranslate:!!force});
    page.querySelector(`#${idPfx}-trans`).addEventListener('click',async()=>{await runTranslation(mkArgs(false));});
    page.querySelector(`#${idPfx}-retr`).addEventListener('click',async()=>{if(!confirm('재번역?')) return; await runTranslation(mkArgs(true));});
    page.querySelector(`#${idPfx}-titles`)?.addEventListener('click',async()=>{
        await runTitleTranslation({
            items, list, ns, pBar, pLabel, pWrap, btnStop,
            onDone: () => {
                // Show the freshly translated titles right away
                if (!_eyeOn && eyeBtn) eyeBtn.click();
                else applyEyeMode();
            },
        });
    });
    btnStop?.addEventListener('click',()=>{stopReq=true;});
    page.querySelector(`#${idPfx}-clr`).addEventListener('click',()=>{
        // Respect selection: if items selected, clear only those; otherwise clear all loaded
        const selectedIds = [...list.querySelectorAll('.pt-block-item.selected')].map(el=>el.dataset.id).filter(Boolean);
        const targetIds = selectedIds.length ? selectedIds : items.map(i=>i.id);
        const scope = selectedIds.length ? `선택한 ${selectedIds.length}개 항목` : `로드된 전체 ${items.length}개 항목`;
        if(!confirm(`${scope}의 번역 캐시를 비울까요?`)) return;
        clearNS(ns, targetIds);
        // Update UI: reset translated text only for cleared items
        const targetSet = new Set(targetIds);
        list.querySelectorAll('.pt-block-item').forEach(el => {
            if (!targetSet.has(el.dataset.id)) return;
            const trEl = el.querySelector('.pt-translated-text');
            if (trEl) trEl.innerHTML = '<span class="pt-no-trans">번역 전</span>';
        });
    });

    // ── Export: Copy ──────────────────────────────────────────────────
    page.querySelector(`#${idPfx}-copy`)?.addEventListener('click', async () => {
        if (!items.length) { if (typeof toastr!=='undefined') toastr.warning('로드된 데이터가 없습니다'); return; }
        const checkedCount = page.querySelectorAll('.pt-block-item.selected').length;
        if (checkedCount === 0) {
            if (typeof toastr!=='undefined') toastr.warning('복사할 항목을 먼저 선택해주세요');
            return;
        }
        const targets = collectTargetItems(page, items, idPfx, ns);
        const choice = await askTextChoice('어떤 내용을 복사할까요?');
        if (!choice) return;
        const text = formatItemsAsText(targets, choice);
        const ok = await copyTextToClipboard(text);
        if (typeof toastr!=='undefined') {
            ok ? toastr.success(`${targets.length}개 항목 복사됨`) : toastr.error('복사 실패');
        }
    });

    // ── Export: TXT ───────────────────────────────────────────────────
    page.querySelector(`#${idPfx}-txt`)?.addEventListener('click', async () => {
        if (!items.length) { if (typeof toastr!=='undefined') toastr.warning('로드된 데이터가 없습니다'); return; }
        const checkedCount = page.querySelectorAll('.pt-block-item.selected').length;
        if (checkedCount === 0) {
            if (typeof toastr!=='undefined') toastr.warning('내보낼 항목을 먼저 선택해주세요');
            return;
        }
        const targets = collectTargetItems(page, items, idPfx, ns);
        const choice = await askTextChoice('어떤 내용을 내보낼까요?');
        if (!choice) return;
        const text = formatItemsAsText(targets, choice);
        const srcName = getSourceName(kind, page, idPfx);
        const suffix = choice === 'original' ? 'original' : (choice === 'translated' ? effLang() : `${effLang()}_bilingual`);
        const filename = `${sanitizeFilename(srcName)}_${suffix}.txt`;
        downloadBlob(new Blob([text], {type:'text/plain;charset=utf-8'}), filename);
        if (typeof toastr!=='undefined') toastr.success(`${filename} 다운로드됨`);
    });

    // ── Export: JSON ──────────────────────────────────────────────────
    page.querySelector(`#${idPfx}-json`)?.addEventListener('click', async () => {
        if (!items.length) { if (typeof toastr!=='undefined') toastr.warning('로드된 데이터가 없습니다'); return; }
        try {
            const srcSel = page.querySelector(`#${idPfx}-sel`);
            const srcVal = srcSel?.value || '';

            // Build set of selected item ids (for partial export in WI/char)
            const checkedIds = new Set(
                Array.from(page.querySelectorAll('.pt-block-item.selected'))
                    .map(el => el.dataset.id)
                    .filter(Boolean)
            );

            let result;
            if (kind === 'preset' || kind === 'wi') {
                const mode = await askChoice('어떤 형식으로 내보낼까요?', [
                    { v: 'data',   label: kind === 'wi' ? 'ST 월드인포 JSON' : 'ST 프리셋 JSON' },
                    { v: 'script', label: 'JS Runner 제목 번역 스크립트' },
                ]);
                if (!mode) return;
                if (mode === 'script') {
                    const r = exportTitleScript(kind, srcVal, items, ns);
                    const blob = new Blob([JSON.stringify(r.data, null, 2)], {type:'application/json;charset=utf-8'});
                    downloadBlob(blob, r.filename);
                    if (typeof toastr!=='undefined') {
                        const skipMsg = r.skipped ? `, 미번역 ${r.skipped}개 제외` : '';
                        toastr.success(`${r.filename} 다운로드됨 (제목 ${r.count}개${skipMsg})`);
                    }
                    return;
                }
            }
            if (kind === 'preset') {
                // Preset: always full export (structure integrity)
                result = exportPresetJSON(srcVal);
            } else if (kind === 'wi') {
                // WI: partial selection supported
                result = await exportWorldInfoJSON(srcVal, checkedIds);
            } else if (kind === 'char') {
                // Character: partial field selection supported
                const includeCB = confirm('캐릭터 카드에 임베디드 월드북(character_book)이 포함되어 있는 경우, JSON에 함께 포함할까요?\n\n[확인] = 포함 (원문 그대로)\n[취소] = 제외\n\n※ 임베디드 월드북의 내용은 번역되지 않고 원문 그대로 저장됩니다.');
                result = await exportCharacterJSON(srcVal, { includeCharacterBook: includeCB }, checkedIds);
            }
            if (!result) return;
            const blob = new Blob([JSON.stringify(result.data, null, 2)], {type:'application/json;charset=utf-8'});
            downloadBlob(blob, result.filename);
            if (typeof toastr!=='undefined') {
                let scopeMsg = '';
                if (kind === 'wi' && checkedIds.size > 0) scopeMsg = ` (선택한 ${checkedIds.size}개 엔트리)`;
                else if (kind === 'char' && checkedIds.size > 0) scopeMsg = ` (선택한 ${checkedIds.size}개 필드)`;
                toastr.success(`${result.filename} 다운로드됨${scopeMsg}`);
            }
        } catch (err) {
            console.error(`[${EXT}] JSON export failed`, err);
            if (typeof toastr!=='undefined') toastr.error('JSON 내보내기 실패: ' + (err?.message || err));
        }
    });
}

// Collect items: selected ones if any, else all
function collectTargetItems(page, items, idPfx, ns) {
    const checked = Array.from(page.querySelectorAll('.pt-block-item.selected'))
        .map(el => el.dataset.id)
        .filter(Boolean);
    const sourceList = checked.length > 0
        ? items.filter(i => checked.includes(String(i.id)))
        : items;
    // Attach _ns to each item for formatter
    return sourceList.map(i => ({ ...i, _ns: ns }));
}

// Get the source name (preset/world/char name) from the select box
function getSourceName(kind, page, idPfx) {
    const sel = page.querySelector(`#${idPfx}-sel`);
    if (!sel) return 'untitled';
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
        // current
        if (kind === 'preset') return oai_settings?.preset_settings_openai || 'preset';
        return 'current';
    }
    return opt.textContent || opt.value || 'untitled';
}

// ── Panel ──────────────────────────────────────────────────────────────
function openPanel() {
    PDOC.getElementById('pt-panel')?.classList.remove('pt-hidden');
}
function closePanel() {
    PDOC.getElementById('pt-panel')?.classList.add('pt-hidden');
}

// Shows the model configured in the extension settings next to the status
// text. This is a straight read of the saved setting — no live detection.
function updateStatusModel() {
    const el = PDOC.getElementById('pt-status-model');
    if (!el) return;
    const c = cfg();
    const model = (c.model === '__custom__' ? (c.customModelName || '') : (c.model || '')).trim();
    el.textContent = model ? `· ${model}` : '';
    el.title = model || '';
}

function applyFontSizes() {
    const p = PDOC.getElementById('pt-panel');
    if (!p) return;
    const c = cfg();
    p.style.setProperty('--pt-original-size', (c.originalFontSize || 11) + 'px');
    p.style.setProperty('--pt-translated-size', (c.translatedFontSize || 12) + 'px');
}

function buildPanel() {
    PDOC.getElementById('pt-panel')?.remove();
    const panel=PDOC.createElement('div');
    panel.id='pt-panel';
    panel.classList.add('pt-hidden');
    panel.setAttribute('data-pt-theme', cfg().theme||'dark');
    // 글자 크기 CSS 변수 주입
    const _c = cfg();
    panel.style.setProperty('--pt-original-size', (_c.originalFontSize || 11) + 'px');
    panel.style.setProperty('--pt-translated-size', (_c.translatedFontSize || 12) + 'px');
    panel.innerHTML=`
        <div id="pt-panel-header">
            <h3>Prompt Panel</h3>
            <div style="display:flex;align-items:center;gap:4px;">
                <button id="pt-panel-refresh" title="목록 새로고침" aria-label="새로고침">↻</button>
                <button id="pt-panel-close" title="닫기" aria-label="닫기">✕</button>
            </div>
        </div>
        <div id="pt-tabs">
            <button class="pt-tab active" data-tab="preset">프리셋</button>
            <button class="pt-tab" data-tab="wi">월드인포</button>
            <button class="pt-tab" data-tab="char">봇카드</button>
        </div>
        <div id="pt-panel-content">
            <div class="pt-page active" id="pt-page-preset"></div>
            <div class="pt-page"        id="pt-page-wi"></div>
            <div class="pt-page"        id="pt-page-char"></div>
        </div>
        <div id="pt-statusbar">
            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                <div class="pt-status-dot" id="pt-status-dot"></div>
                <span id="pt-status-text">대기 중</span>
                <span class="pt-status-model" id="pt-status-model"></span>
            </div>
        </div>`;
    PDOC.body.appendChild(panel);

    panel.querySelectorAll('.pt-tab').forEach(tab=>tab.addEventListener('click',()=>{
        panel.querySelectorAll('.pt-tab').forEach(t=>t.classList.remove('active'));
        panel.querySelectorAll('.pt-page').forEach(p=>p.classList.remove('active'));
        tab.classList.add('active');
        panel.querySelector(`#pt-page-${tab.dataset.tab}`).classList.add('active');
    }));
    updateStatusModel();
    panel.querySelector('#pt-panel-close').addEventListener('click',closePanel);

    // Refresh button: rebuild select dropdowns only. Loaded items and translation cache are untouched.
    panel.querySelector('#pt-panel-refresh').addEventListener('click', async () => {
        try {
            // Re-import modules to get the latest references.
            // ST may reassign these collections (not just mutate them) when
            // presets/world info/characters are added or removed, so our
            // captured references can become stale. Re-importing forces ESM
            // to give us the current live bindings.
            try {
                const s = import.meta.url;
                const tp = s.includes('/third-party/');
                const base  = tp ? '../../../../' : '../../../';
                const base2 = tp ? '../../../'    : '../../';
                const sm = await import(base + 'script.js');
                characters            = sm.characters;
                const om = await import(base2 + 'openai.js');
                openai_settings      = om.openai_settings;
                openai_setting_names = om.openai_setting_names;
                const wi = await import(base2 + 'world-info.js');
                world_names = wi.world_names;
                world_info  = wi.world_info;
            } catch (impErr) {
                console.warn(`[${EXT}] refresh: re-import failed, falling back to cached refs`, impErr);
            }

            const refreshSelect = (idPfx, listFn) => {
                const sel = panel.querySelector(`#${idPfx}-sel`);
                if (!sel) return;
                const currentVal = sel.value;
                const items = listFn() || [];
                const fragment = ['<option value="">— 선택 —</option>']
                    .concat(items.map(it => `<option value="${esc(it.id)}">${esc(it.name)}</option>`));
                sel.innerHTML = fragment.join('');
                // Preserve previous selection if it still exists
                if (currentVal && [...sel.options].some(o => o.value === currentVal)) {
                    sel.value = currentVal;
                }
            };
            refreshSelect('pt-preset', listAllPresets);
            refreshSelect('pt-wi',     listAllWorldInfos);
            refreshSelect('pt-char',   listAllCharacters);
            if (typeof toastr !== 'undefined') toastr.success('목록을 새로고침했습니다');
        } catch (e) {
            console.error(`[${EXT}] refresh failed`, e);
            if (typeof toastr !== 'undefined') toastr.error('새로고침 실패');
        }
    });

    buildPage({page:panel.querySelector('#pt-page-preset'),idPfx:'pt-preset',listFn:listAllPresets,loadFn:readPresetBlocks,selectable:true,icon:'📋',hint:'프리셋을 선택하고 로드하세요.',isAsync:false,kind:'preset'});
    buildPage({page:panel.querySelector('#pt-page-wi'),idPfx:'pt-wi',listFn:listAllWorldInfos,loadFn:readWorldInfo,selectable:true,icon:'🌍',hint:'월드인포를 선택하고 로드하세요.',isAsync:true,kind:'wi'});
    buildPage({page:panel.querySelector('#pt-page-char'),idPfx:'pt-char',listFn:listAllCharacters,loadFn:readCharCard,selectable:true,icon:'🃏',hint:'캐릭터를 선택하고 로드하세요.',isAsync:true,kind:'char'});

    try { const cur=getCurrentPresetName(); if(cur)panel.querySelector('#pt-preset-sel').value=cur; } catch(e){}
    try {
        const ctx=SillyTavern.getContext();
        const cid=ctx.characterId;
        if (cid != null) {
            const ch = ctx.characters?.[cid] || characters?.[cid];
            const avatar = ch?.avatar;
            if (avatar) panel.querySelector('#pt-char-sel').value = avatar;
        }
    } catch(e){}

    // 패널 내 CSS 로드
    if (CSS_URL && !PDOC.getElementById('pt-panel-css')) {
        const link=PDOC.createElement('link');
        link.id='pt-panel-css'; link.rel='stylesheet'; link.href=CSS_URL;
        PDOC.head.appendChild(link);
    }
}

// ── Floating Action Button (FAB) ─────────────────────────────────────
function buildFab() {
    // cleanup
    PDOC.getElementById('pt-fab')?.remove();
    PDOC.getElementById('pt-fab-css')?.remove();
    if (cfg().fabVisible === false) return;

    // CSS로 강제 표시 — ST의 어떤 레이어도 못 가리게
    // isolation: isolate 를 쓰면 안 되고 반대로 우리 FAB 위에 새 stacking context 생성을 막아야 함
    // 가장 확실한 방법: <style>을 parent document head에 직접 삽입
    const style = PDOC.createElement('style');
    style.id = 'pt-fab-css';
    style.textContent = `
        #pt-fab {
            position: fixed !important;
            z-index: 2147483647 !important;
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
            display: flex !important;
            clip: auto !important;
            clip-path: none !important;
            transform: none;
            overflow: visible !important;
        }
    `;
    PDOC.head.appendChild(style);

    const fab = PDOC.createElement('div');
    fab.id = 'pt-fab';
    fab.setAttribute('role', 'button');
    fab.setAttribute('tabindex', '0');
    fab.title = '번역 패널';
    fab.textContent = '🐳';

    // 저장된 위치 복원 + 화면 밖 방지 (viewport clamp)
    // bottom/right 사용 시 부모의 transform 때문에 잘못 계산되는 이슈가 있어서
    // 항상 top/left로 명시적 좌표 사용
    const rawPos = cfg().fabPos || {};
    const vw = PAR.innerWidth || 400;
    const vh = PAR.innerHeight || 800;
    const FAB_SIZE = 52;
    // 기본 위치: 우측 하단 (right:16, bottom:90) → top/left 변환
    const defaultLeft = vw - FAB_SIZE - 16;
    const defaultTop  = vh - FAB_SIZE - 90;
    let finalLeft = rawPos.left !== undefined ? rawPos.left : defaultLeft;
    let finalTop  = rawPos.top  !== undefined ? rawPos.top  : defaultTop;
    // viewport 안으로 clamp
    finalLeft = Math.max(8, Math.min(vw - FAB_SIZE - 8, finalLeft));
    finalTop  = Math.max(8, Math.min(vh - FAB_SIZE - 8, finalTop));

    Object.assign(fab.style, {
        position:       'fixed',
        left:           finalLeft + 'px',
        top:            finalTop + 'px',
        right:          'auto',
        bottom:         'auto',
        zIndex:         '2147483647',
        width:          '52px',
        height:         '52px',
        background:     'transparent',
        border:         'none',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         'grab',
        userSelect:     'none',
        touchAction:    'none',
        webkitUserSelect: 'none',
        fontSize:       '36px',
        lineHeight:     '1',
        padding:        '0',
        margin:         '0',
        pointerEvents:  'auto',
        visibility:     'visible',
        opacity:        '1',
        filter:         'drop-shadow(0 2px 8px rgba(0,0,0,.5))',
        transition:     'transform .1s',
        overflow:       'visible',
    });

    // 마운트: documentElement(<html>)에 직접 attach하면 어떤 transform/containing block 영향도 안 받음
    // body에 붙으면 부모 중에 transform 있을 때 position:fixed가 그 기준으로 계산되는 버그 회피
    const mountTarget = PDOC.documentElement || PDOC.body;
    mountTarget.appendChild(fab);

    // DOM에서 제거되면 재부착
    const ensureMounted = () => {
        const existing = PDOC.getElementById('pt-fab');
        if (!existing && cfg().fabVisible !== false) {
            mountTarget.appendChild(fab);
        } else if (existing && existing !== fab) {
            existing.remove();
            mountTarget.appendChild(fab);
        }
    };
    clearInterval(window.__stPresetTranslator_fabWatcher);
    window.__stPresetTranslator_fabWatcher = setInterval(ensureMounted, 1500);

    // 드래그
    let dragging = false, moved = false, sx = 0, sy = 0, il = 0, it = 0;

    fab.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true; moved = false;
        fab.style.cursor = 'grabbing';
        fab.style.transform = 'scale(1.15)';
        const r = fab.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; il = r.left; it = r.top;
        fab.style.right  = 'auto'; fab.style.bottom = 'auto';
        fab.style.left   = r.left + 'px'; fab.style.top = r.top + 'px';
        try { fab.setPointerCapture(e.pointerId); } catch(er) {}
    });

    fab.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        const vw = PAR.innerWidth, vh = PAR.innerHeight;
        fab.style.left = Math.max(0, Math.min(vw - 52, il + dx)) + 'px';
        fab.style.top  = Math.max(0, Math.min(vh - 52, it + dy)) + 'px';
    });

    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        fab.style.cursor = 'grab';
        fab.style.transform = '';
        if (moved) {
            const r = fab.getBoundingClientRect();
            cfg().fabPos = { left: Math.round(r.left), top: Math.round(r.top) };
            saveSettingsDebounced();
        } else {
            const panel = PDOC.getElementById('pt-panel');
            if (panel) panel.classList.contains('pt-hidden') ? openPanel() : closePanel();
        }
    };
    fab.addEventListener('pointerup', onUp);
    fab.addEventListener('pointercancel', onUp);
}

// ── Settings HTML ──────────────────────────────────────────────────────
function buildSettingsHTML() {
    const c=cfg();
    const langOpts=[['Korean','한국어'],['English','English'],['Japanese','日本語'],['Chinese (Simplified)','简体中文'],['Chinese (Traditional)','繁體中文'],['Polish','Polski'],['__custom__','⚙️ 직접 입력']]
        .map(([v,l])=>`<option value="${v}" ${c.targetLang===v?'selected':''}>${l}</option>`).join('');
    const isCustomLang = c.targetLang === '__custom__';
    const provOpts=PROVIDER_LIST.map(p=>`<option value="${p.key}" ${(c.provider||'openai')===p.key?'selected':''}>${p.label}</option>`).join('');
    const currentProv=c.provider||'openai', modelList=PROVIDER_MODELS[currentProv]||[];
    const currentModel=c.model||'', isCustomMdl=currentModel==='__custom__';
    let modelOpts='<option value="">모델 선택...</option>';
    modelList.forEach(m=>{modelOpts+=`<option value="${m}" ${currentModel===m?'selected':''}>${m}</option>`;});
    modelOpts+=`<option value="__custom__" ${isCustomMdl?'selected':''}>⚙️ 커스텀 모델 입력</option>`;
    const themeOpts=[['dark','🌙 Dark'],['light','☀️ Light'],['pink','🌸 Pink'],['mint','🌿 Mint'],['orange','🍊 Orange'],['blue','💙 Blue']]
        .map(([v,l])=>`<option value="${v}" ${c.theme===v?'selected':''}>${l}</option>`).join('');

    return `
<div class="pt-extension-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>Prompt Panel</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">

      <!-- (1) 프롬프트 패널 구역 -->
      <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px;">프롬프트 패널</label>
      <div class="pt-ext-row" style="margin-top:2px;"><button id="pt-open-panel-btn" class="menu_button" style="flex:1;"><i class="fa-solid fa-language"></i>&nbsp;패널 열기</button></div>
      <label class="checkbox_label" style="margin-top:8px;margin-bottom:2px;"><input type="checkbox" id="pt-fab-toggle" ${c.fabVisible!==false?'checked':''} class="checkbox"><span>플로팅 버튼 표시🐳</span></label>
      <small style="display:block;margin-left:24px;margin-bottom:8px;color:var(--SmartThemeQuoteColor,#888);font-size:11px;line-height:1.5;">언제든지 패널을 열 수 있는 아이콘입니다.</small>
      <div class="pt-ext-row"><label for="pt-target-lang">번역 언어</label><select id="pt-target-lang" class="text_pole" style="max-width:160px;">${langOpts}</select></div>
      <div id="pt-custom-lang-row" class="pt-ext-row" style="${isCustomLang?'':'display:none;'}"><label for="pt-custom-lang">Language</label><input id="pt-custom-lang" class="text_pole" type="text" value="${esc(c.customLang||'')}" placeholder="예: Français, Español" style="max-width:160px;"></div>
      <small id="pt-custom-lang-hint" style="display:${isCustomLang?'block':'none'};margin-bottom:8px;color:var(--SmartThemeQuoteColor,#888);font-size:11px;line-height:1.5;">번역 요청에 그대로 쓰이는 값입니다. 영어 언어명 권장 (예: French).</small>
      <div class="pt-ext-row"><label for="pt-title-batch">제목 번역 묶음 개수</label><input id="pt-title-batch" class="text_pole" type="number" min="1" max="50" step="1" value="${c.titleBatchSize||15}" style="max-width:80px;"></div>
      <div class="pt-ext-row"><label for="pt-req-delay">요청 간 대기(ms)</label><input id="pt-req-delay" class="text_pole" type="number" min="0" max="60000" step="50" value="${c.requestDelayMs??60}" style="max-width:80px;"></div>
      <small style="display:block;margin-bottom:8px;color:var(--SmartThemeQuoteColor,#888);font-size:11px;line-height:1.5;">"제목만" 번역은 여러 제목을 한 요청으로 묶어 보냅니다. 본문 번역은 항상 토글 1개당 1요청이며, 대기 시간으로 속도를 조절합니다. API 분당 한도(예: Vertex AI)에 걸리면 묶음 개수를 늘리고 대기 시간을 키우세요.</small>
      <div class="pt-ext-row"><label for="pt-theme">테마</label><select id="pt-theme" class="text_pole" style="max-width:160px;">${themeOpts}</select></div>
      <div class="pt-ext-row pt-slider-row">
        <label for="pt-orig-size">원문 글자 크기</label>
        <input type="range" id="pt-orig-size" min="9" max="18" step="1" value="${c.originalFontSize||11}">
        <span id="pt-orig-size-val" class="pt-slider-val">${c.originalFontSize||11}px</span>
      </div>
      <div class="pt-ext-row pt-slider-row">
        <label for="pt-trans-size">번역문 글자 크기</label>
        <input type="range" id="pt-trans-size" min="10" max="20" step="1" value="${c.translatedFontSize||12}">
        <span id="pt-trans-size-val" class="pt-slider-val">${c.translatedFontSize||12}px</span>
      </div>

      <hr>

      <!-- (2) API 설정 구역 -->
      <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px;">API 설정</label>
      <div class="pt-ext-row"><label>프로바이더</label><select id="pt-provider" class="text_pole" style="max-width:180px;">${provOpts}</select></div>
      <div class="pt-ext-row"><label>모델</label><select id="pt-model-select" class="text_pole" style="max-width:180px;">${modelOpts}</select></div>
      <div id="pt-custom-model-row" class="pt-ext-row" style="${isCustomMdl?'':'display:none;'}"><label>모델명 입력</label><input id="pt-model-custom" class="text_pole" type="text" value="${esc(c.customModelName||'')}" placeholder="모델명 직접 입력" style="max-width:180px;"></div>
      <div id="pt-params-wrap" style="margin-top:4px;"></div>
      <label class="checkbox_label" style="margin-top:10px;margin-bottom:6px;"><input type="checkbox" id="pt-use-proxy" ${c.useReverseProxy?'checked':''}><span>리버스 프록시 사용</span></label>
      <div id="pt-proxy-wrap" style="${c.useReverseProxy?'':'display:none;'}">
        <div class="pt-ext-row"><label>프록시 URL</label><input id="pt-proxy-url" class="text_pole" type="text" value="${esc(c.reverseProxyUrl||'')}" placeholder="https://..." style="max-width:200px;"></div>
        <div class="pt-ext-row"><label>프록시 비밀번호</label><input id="pt-proxy-pw" class="text_pole" type="password" value="${esc(c.reverseProxyPassword||'')}" placeholder="(선택)" style="max-width:200px;"></div>
      </div>

      <hr>

      <!-- (3) Prefill 구역 -->
      <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px;">Prefill</label>
      <label class="checkbox_label" style="margin-bottom:6px;"><input type="checkbox" id="pt-prefill-toggle" ${c.prefillEnabled!==false?'checked':''}><span>번역 프리필 사용</span></label>
      <textarea id="pt-prefill-text" class="text_pole" rows="2" style="width:100%;font-size:11px;resize:vertical;margin-bottom:2px;">${esc(c.prefillText||'')}</textarea>
      <small style="display:block;margin-bottom:8px;color:var(--SmartThemeQuoteColor,#888);font-size:11px;line-height:1.5;">최신 모델은 프리필과 호환되지 않는 경우가 많습니다. 번역이 실패하면 비활성화를 권장합니다.</small>

      <hr>

      <!-- (4) 번역 캐시 구역 -->
      <label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px;">번역 캐시</label>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 6px 0;font-size:11px;color:var(--SmartThemeQuoteColor,#888);">
        <span>저장된 번역</span>
        <span id="pt-cache-stats" style="font-variant-numeric:tabular-nums;">–</span>
      </div>
      <div class="pt-ext-row"><button id="pt-clear-cache-btn" class="menu_button" style="flex:1;color:#e06060;"><i class="fa-solid fa-trash"></i>&nbsp;전체 캐시 삭제</button></div>
      <small style="color:var(--SmartThemeQuoteColor,#888);line-height:1.6;display:block;margin-top:6px;">번역 데이터는 브라우저 IndexedDB에 저장됩니다.</small>

    </div>
  </div>
</div>`;
}

function updateModelDropdown() {
    const c=cfg(), prov=c.provider||'openai';
    const sel=document.getElementById('pt-model-select'); if(!sel) return;
    const models=PROVIDER_MODELS[prov]||[], current=c.model||'';
    let html='<option value="">모델 선택...</option>';
    models.forEach(m=>{html+=`<option value="${m}" ${current===m?'selected':''}>${m}</option>`;});
    html+=`<option value="__custom__" ${current==='__custom__'?'selected':''}>⚙️ 커스텀 모델 입력</option>`;
    sel.innerHTML=html;
    const cr=document.getElementById('pt-custom-model-row'); if(cr)cr.style.display=(current==='__custom__')?'':'none';
}

function updateCacheStatsUI() {
    const el = document.getElementById('pt-cache-stats');
    if (!el) return;
    const { count, sizeStr } = getCacheStats();
    el.textContent = `${count.toLocaleString()}개 · ${sizeStr}`;
}

function buildParamsUI() {
    const wrap=document.getElementById('pt-params-wrap'); if(!wrap) return;
    const {provider,params}=getCurrentParams(), defaults=DEFAULT_PARAMS[provider]||DEFAULT_PARAMS.openai, keys=Object.keys(defaults);
    let html='';
    keys.forEach(k=>{
        const range=PARAM_RANGES[k]||{min:0,max:1,step:0.01}, val=params[k]??defaults[k];
        html+=`<div class="pt-param-row"><label class="pt-param-label">${PARAM_LABELS[k]||k}</label><input type="range" class="pt-param-slider" data-pkey="${k}" min="${range.min}" max="${range.max}" step="${range.step}" value="${val}"><input type="number" class="pt-param-num" data-pkey="${k}" min="${range.min}" max="${range.max}" step="${range.step}" value="${val}"></div>`;
    });
    html+=`<button class="menu_button" id="pt-params-reset" style="font-size:11px;margin-top:4px;width:100%;">기본값으로 재설정</button>`;
    wrap.innerHTML=html;
    wrap.querySelectorAll('.pt-param-slider,.pt-param-num').forEach(el=>{
        el.addEventListener('input',()=>{
            const k=el.dataset.pkey, v=parseFloat(el.value), {params}=getCurrentParams();
            params[k]=v;
            wrap.querySelectorAll(`[data-pkey="${k}"]`).forEach(o=>{if(o!==el)o.value=v;});
            saveSettingsDebounced();
        });
    });
    document.getElementById('pt-params-reset')?.addEventListener('click',()=>{
        const {provider}=getCurrentParams(); cfg().parameters[provider]={...DEFAULT_PARAMS[provider]}; saveSettingsDebounced(); buildParamsUI();
    });
}

// ── Init ───────────────────────────────────────────────────────────────
jQuery(async()=>{
    console.log(`[${EXT}] init start`);
    try { await initImports(); } catch(e) { console.error(`[${EXT}] initImports failed`, e); return; }
    console.log(`[${EXT}] imports OK`);

    try {
        $('#extensions_settings').append(buildSettingsHTML());
    } catch(e) {
        console.error(`[${EXT}] buildSettingsHTML failed`, e);
        return;
    }
    if (CSS_URL) {
        $('<link>',{id:'pt-main-css',rel:'stylesheet',href:CSS_URL}).appendTo('head');
    }

    // Initialize IndexedDB cache layer + migrate legacy settings.json data
    try { await initTranslationCache(); } catch(e) { console.warn(`[${EXT}] cache init failed, using in-memory only`, e); }
    // 이전 버전 잔여물 정리
    let _needsSave = false;
    if (cfg()._fabDiag !== undefined) { delete cfg()._fabDiag; _needsSave = true; }
    if (cfg().useMainApi !== undefined) { delete cfg().useMainApi; _needsSave = true; }
    if (_needsSave) saveSettingsDebounced();
    updateCacheStatsUI();

    const c=cfg();
    $('#pt-target-lang').on('change',function(){
        cfg().targetLang=this.value;
        saveSettingsDebounced();
        const isCustom = this.value === '__custom__';
        $('#pt-custom-lang-row').toggle(isCustom);
        $('#pt-custom-lang-hint').toggle(isCustom);
    });
    $('#pt-custom-lang').on('input',function(){cfg().customLang=this.value;saveSettingsDebounced();});
    $('#pt-title-batch').on('change',function(){
        let v = parseInt(this.value,10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 50) v = 50;
        this.value = v;
        cfg().titleBatchSize = v; saveSettingsDebounced();
    });
    $('#pt-req-delay').on('change',function(){
        let v = parseInt(this.value,10);
        if (isNaN(v) || v < 0) v = 0;
        if (v > 60000) v = 60000;
        this.value = v;
        cfg().requestDelayMs = v; saveSettingsDebounced();
    });
    $('#pt-theme').on('change',function(){cfg().theme=this.value;saveSettingsDebounced();const p=PDOC.getElementById('pt-panel');if(p)p.setAttribute('data-pt-theme',this.value);});
    $('#pt-orig-size').on('input', function(){
        const v = parseInt(this.value, 10) || 11;
        cfg().originalFontSize = v;
        saveSettingsDebounced();
        const label = document.getElementById('pt-orig-size-val');
        if (label) label.textContent = v + 'px';
        applyFontSizes();
    });
    $('#pt-trans-size').on('input', function(){
        const v = parseInt(this.value, 10) || 12;
        cfg().translatedFontSize = v;
        saveSettingsDebounced();
        const label = document.getElementById('pt-trans-size-val');
        if (label) label.textContent = v + 'px';
        applyFontSizes();
    });
    $('#pt-provider').on('change',function(){cfg().provider=this.value;cfg().model=(PROVIDER_MODELS[this.value]||[])[0]||'';saveSettingsDebounced();updateModelDropdown();buildParamsUI();updateStatusModel();});
    $(document).on('change','#pt-model-select',function(){cfg().model=this.value;saveSettingsDebounced();const cr=document.getElementById('pt-custom-model-row');if(cr)cr.style.display=(this.value==='__custom__')?'':'none';updateStatusModel();});
    $(document).on('input','#pt-model-custom',function(){cfg().customModelName=this.value;saveSettingsDebounced();updateStatusModel();});
    $('#pt-use-proxy').on('change',function(){cfg().useReverseProxy=this.checked;saveSettingsDebounced();$('#pt-proxy-wrap').toggle(this.checked);});
    $(document).on('input','#pt-proxy-url',function(){cfg().reverseProxyUrl=this.value;saveSettingsDebounced();});
    $(document).on('input','#pt-proxy-pw',function(){cfg().reverseProxyPassword=this.value;saveSettingsDebounced();});
    $('#pt-prefill-toggle').on('change',function(){cfg().prefillEnabled=this.checked;saveSettingsDebounced();});
    $('#pt-prefill-text').on('input',function(){cfg().prefillText=this.value;saveSettingsDebounced();});
    $('#pt-fab-toggle').on('change',function(){
        cfg().fabVisible=this.checked;saveSettingsDebounced();
        if(this.checked){if(!PDOC.getElementById('pt-fab'))buildFab();}
        else PDOC.getElementById('pt-fab')?.remove();
    });
    $('#pt-open-panel-btn').on('click', () => openPanel());
    $('#pt-clear-cache-btn').on('click', async () => {
        const { count, sizeStr } = getCacheStats();
        if (count === 0) {
            if (typeof toastr !== 'undefined') toastr.info('삭제할 번역 캐시가 없습니다');
            return;
        }
        const msg = `⚠️ 번역 데이터가 전부 삭제됩니다.\n\n현재 저장된 번역: ${count}개 (${sizeStr})\n\n이 작업은 되돌릴 수 없습니다.\n정말 삭제할까요?`;
        if (!confirm(msg)) return;
        translationMap.clear();
        await dbClear();
        if (typeof toastr !== 'undefined') toastr.success(`번역 캐시 ${count}개가 삭제되었습니다`);
        updateCacheStatsUI();
    });

    buildPanel();
    buildParamsUI();

    function tryFab(n){
        if(!cfg().fabVisible||PDOC.getElementById('pt-fab'))return;
        if(PDOC.body)buildFab();
        else if(n<30)setTimeout(()=>tryFab(n+1),300);
    }
    if(event_types?.APP_READY)eventSource.once(event_types.APP_READY,()=>tryFab(0));
    setTimeout(()=>tryFab(0),600);
    setTimeout(()=>tryFab(0),2000);

    console.log(`[${EXT}] loaded`);
});
