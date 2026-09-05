# Prompt Panel

A SillyTavern extension that lets you read, translate, search, and export your presets, world info, and character cards from a single panel.

## Features

### Loading data
The panel loads **presets, world info books, and character cards that are registered in your current SillyTavern instance** and shows them in-place.

### Translation
- Per-toggle / per-entry / per-field translation with selective re-translation
- Translation cache is stored in the browser's IndexedDB (not in the SillyTavern settings file)
- Supported providers: OpenAI, Claude, Google AI Studio (MakerSuite), Vertex AI, OpenRouter, DeepSeek, Mistral, Groq, Cohere, xAI, Z.AI (GLM)
- **📛 Title translation**: translates only the titles, batching several per request. Lets you skim a preset with hundreds of toggles and decide which ones are worth translating in full. Stored separately from body translations, so pressing ✦번역 later still performs a full translation.
- **👀 Show translated titles**: switches the titles shown in the panel to their translations. Press again to revert. Display only — no data is modified.
- **Custom target language**: pick `⚙️ 직접 입력` in the dropdown to type any language you want. Languages outside the preset list are fully supported; the value you type is sent to the model verbatim (an English language name such as `French` works best).
- **World Info keyword translation**: an entry's primary keywords and optional filter ride along at the top of the translated body and are written back to the `key` and `keysecondary` fields on JSON export.
  - Primary keywords are **added** to the originals, so the entry triggers in either language.
  - Secondary keywords depend on the entry's Logic setting. `AND ANY` and `NOT ANY` are merged like primary keywords, but `AND ALL` and `NOT ALL` require *every* term to match, so adding items would stop the entry from ever firing. For those two, the translated terms **replace** the originals instead, meaning such entries work only in the target language.
- **World Info entry info**: expanding an entry shows its activation mode (🔵 constant / 🟢 keyed / 🔗 vectorized), position, depth, order and trigger % in small text. Informational only — never translated.
- **Rate control**: the extension drawer lets you set the title-translation batch size and the delay between requests (ms). Raise the delay if you hit an API per-minute limit (e.g. Vertex AI). (1000ms = 1 second)
- Per-provider sampling parameters can be configured individually

### Search
Keyword search runs against both the original and translated text. Matching parts are highlighted inline in the panel.

### Token count
The total token count of all loaded items, and the sum for the selected toggles, are shown live.

### Copy & Export
Each tab (Preset / World Info / Character) has three icon buttons in the top-right area.

- **Copy** — copy to clipboard
- **TXT export** — save as a text file
- **JSON export** — save as a SillyTavern-compatible JSON file

#### Copy / TXT export
You can select only some toggles and copy/export just those. When you trigger the action you choose between **Original / Translated / Both**. Untranslated items show up as `(번역없음)` in the "Translated" and "Both" modes.

#### JSON export
- **Preset** is **always exported in full**, regardless of selection (so the structure stays valid). **Embedded regex scripts and other extension settings are exported alongside the prompts**
- **World Info** exports only the selected entries when partial selection is used.
- **Character Card** applies translations only to the selected fields when partial selection is used. **If the card contains an embedded `character_book`**, you'll be asked whether to include it; if you choose to include it, it is exported as-is (original content).
- Toggle titles are translated too. On JSON export, the translated title is placed back into the proper name field (`name` for preset prompts, `comment` for world info entries).

#### JS Runner title-translation script
On the Preset and World Info tabs, the JSON export button opens a format picker. Choosing **JS Runner title-translation script** generates a script that makes the titles appear translated inside SillyTavern's own UI. Import it into the JS-Slash-Runner extension.

- Preset: renames prompt toggle entries to their translated titles.
- World Info: adds the translated title as a hint above each entry title. It never writes to any input value, so your world info data cannot be altered.
- Either way it only changes what is displayed. Disabling the script in JS Runner reverts it immediately.

#### File name
Files are auto-named as `{sourceName}_{targetLanguage}.{extension}` and saved to the browser's default download folder.

### UI
- **Floating icon**: optional, draggable on-screen icon that opens the panel from anywhere
- Preset / World Info / Character tabs
- Refresh button in the panel header — instantly syncs newly added/removed items from SillyTavern (translation cache is preserved)
- Adjustable font size for both original and translated text
- Six themes: Dark, Light, Pink, Mint, Orange, Blue
- The status bar also shows the translation model currently configured

### Target Languages
Korean, English, Japanese, Chinese (Simplified), Chinese (Traditional), Polish, etc(custom).


## Notes

- All exports work on a deep clone of the source data and modify only the clone, so **your original presets, world info, and character cards are never modified.**
- The character card JSON export uses the V3 spec's `data.*` path as the source of truth and clears the V1-compat top-level duplicates to keep the file lean. SillyTavern reads `data.*` first on import, so compatibility is unaffected.


## License & Attribution

This extension is a **modified fork** of [anon4961/prompt-panel](https://github.com/anon4961/prompt-panel).

- All licensing follows the license stated in the original project (**AGPL-3.0**). See [LICENSE](LICENSE) for the full text.
- The original copyright and license notices are kept intact.
- This repository modifies parts of the original code's features and UI.