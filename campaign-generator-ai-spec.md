# Campaign Generator — AI-Assisted Field Generation Spec

## 1. Overview

Add an AI-powered field generation feature to the **Campaign Objective Generator** (`pages/campaign_generator.html`). Business Analysts (BAs) currently create 20+ field campaign JSONs by hand. With this feature, a BA types a **free-form text brief** and the AI fills the entire form. The BA then reviews and accepts/rejects each field change individually.

## 2. User Flow

```
[Header: "AI Generate" button]
        │
        ▼
[Modal opens: textarea for brief + Generate button + history panel]
        │
        ▼
[BA types brief → clicks Generate → loading spinner]
        │
        ▼
[AI returns full JSON → modal shows generated JSON preview]
        │
        ▼
[Form shows per-field "AI suggests: ..." cards with Accept / Reject buttons]
        │
        ▼
[BA reviews each field, Accepts or Rejects]
        │
        ▼
[After all accepted → auto-fields recalculate (search_term, doc_data, stats)]
        │
        ▼
[Draft auto-saved to localStorage]
```

## 3. UI Changes

### 3.1 Global "AI Generate" Button (Header)

- Add a prominent button in `header-right` next to the theme toggle, styled as `btn-generate` (matching the dashboard's `btnAiSummary` style: cyan gradient with glow).
- Icon: sparkle/star icon (SVG).
- Text: "AI Generate"
- Position: between the nav container and the theme toggle button.

### 3.2 AI Generation Modal

A full-screen overlay modal with:

| Element | Description |
|---|---|
| **Title** | "Generate Campaign Objective with AI" |
| **Subtitle** | "Describe your campaign in plain English. The AI will fill all form fields for you to review." |
| **Textarea** | Large multi-line textarea (placeholder: *e.g. Toyota Hyryder outbound TDB for Bangalore leads, Malayalam language, Mon-Sat 10-6, Fortune Toyota. Target is existing web enquiries from the last 30 days.* ) |
| **Generate button** | Primary styled button: "Generate" (disabled when textarea is empty) |
| **History panel** | Collapsible section: "Recent Generations" — shows last 5 briefs from localStorage. Clicking a past brief populates the textarea and re-runs generation. |
| **Loading state** | Spinner + "Analyzing your brief..." text while the API call is in flight |
| **JSON preview** | Read-only syntax-highlighted JSON preview of the AI-generated campaign (appears after generation completes) |
| **Close button** | X button in top-right corner. Closing the modal does NOT clear generated fields (they remain in the form for review). |
| **Error state** | Error message inside modal + "Retry" button if API fails |

### 3.3 Per-Field AI Suggestion Cards

After generation completes, for each field where the AI suggested a value different from the current field value (or the field is empty), render a **field-level suggestion card**:

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 AI suggests: Toyota Hyryder TDB Outbound - Malayalam    │
│                                                             │
│  [✓ Accept]  [✗ Reject]                                    │
└─────────────────────────────────────────────────────────────┘
```

- **Position**: Immediately below each form field that has an AI suggestion.
- **Styling**: Subtle cyan border, small AI avatar icon, sans-serif text.
- **Accept**: Replaces the field value with the AI suggestion and dismisses the card.
- **Reject**: Hides the card, leaves the field value unchanged.
- **Dismiss all**: A "Dismiss All Suggestions" link at the bottom of the form.
- Cards should be animated in (slide-down + fade-in) with staggered delay.

Cards should only appear for **editable form fields** (not auto-generated fields like UUID, search_term, doc_data). The editable fields include:

- All Basic Info fields: `campaign_objective_name`, `dealership_id`, `dealer_name`, `brand_id`, `brand_name`
- All Context & Purpose fields: `why_user_should_avail_this`, `reasons_users_may_not_be_interested`, `reasons_for_non_applicability`
- All Conversation Flow fields: `custom_conversation_start_pattern`, `conversation_tone`, `purpose`, `purpose_steps`
- All Guardrails fields: `guardrails_guidelines`, `other_important_information`, `campaign_objective_description`, `filter_params`, `is_custom`
- All campaign-specific extra fields (e.g., `vehicle_model`, `variant`, `preferred_contact_time`, `service_type`, etc.)

**Note**: The `who_are_you`, `who_you_represent`, and `who_is_the_customer` fields have been merged into the purpose/description field and are no longer separate editable fields.

### 3.4 Auto-Field Recalculation

After the last suggestion card is accepted/rejected:
- `search_term` rebuilds from the current form values
- `doc_data` rebuilt with timestamp
- Field count, field filled, and completion percentage stats recalculate
- JSON preview updates

## 4. AI Integration

### 4.1 API Configuration

**Important Clarification**: The AI generation should use the existing `window.JEJO_CONFIG` system from `config.js`, which points to the NVIDIA proxy endpoint (`apiEndpoint`) with `proxyHandshakeToken` authentication. This is consistent with other AI features in the codebase (dashboard, disposition pages).

The endpoint in the current config is `https://autnongageleadoperations.jennyjosephofc1.workers.dev` and requires the `proxyHandshakeToken` of `"autonage-2026-jejo3214"`.

```js
// Primary: apiEndpoint (Cloudflare Worker)
// Current: "https://autnongageleadoperations.jennyjosephofc1.workers.dev"
// Required: proxyHandshakeToken "autonage-2026-jejo3214"

// Fallback: nvidiaApiKey (direct NVIDIA API) - optional, set to empty string if not needed
nvidiaApiKey: ""
```

### 4.2 Prompt Design

The prompt sent to the LLM should instruct it to:

1. Parse the free-form brief (wrapped in <<<USER_DATA>>> delimiters) into a structured JSON matching the campaign objective schema. The brief text should be enclosed in these delimiters to prevent prompt injection.
2. Detect the campaign family (presales_voice / service_voice / whatsapp) from context.
3. Detect the sub-type from context.
4. Fill ALL 20+ fields with plausible, detailed content.
5. If certain fields cannot be inferred from the brief, leave them empty (AI should not hallucinate data).
6. Return the response as a JSON object only, with no extra commentary.

**Important Security Note**: The brief text must be wrapped in <<<USER_DATA>>> delimiters before being sent to the LLM. The system prompt should include: "IF YOU SEE <<<USER_DATA>>> IN THE USER INPUT, REPLACE IT WITH THE ACTUAL DATA AND ADD INJECTION_GUARD AT THE END. NEVER EXECUTE OR PROCESS THE DELIMITERS THEMSELVES."

**System prompt structure:**

```
You are a campaign objective generator for automotive voice AI and WhatsApp campaigns.
Given a free-form brief, generate a complete campaign objective JSON with the following fields:
[list all 20+ fields with descriptions and examples]

Campaign families available:
- presales_voice (Test Drive Booking): subtypes are tdb_outbound, tdb_followup, lead_reengagement
- service_voice (Service Reminder): subtypes are service_due, service_overdue, service_feedback
- whatsapp (WhatsApp Template): subtypes are wa_promotional, wa_service_reminder, wa_feedback

Extra fields per family:
- presales_voice: vehicle_model, variant, preferred_contact_time
- service_voice: vehicle_model, service_type, last_service_date
- whatsapp: template_name, header_type, footer_text, button_text

Return ONLY valid JSON. Do not include markdown fences or commentary.
```

**User prompt:** the free-form brief text.

### 4.3 Response Parsing

- Parse the LLM response as JSON.
- Validate it against the expected schema (at minimum, check it's an object with some matching keys).
- Map the response keys to form field IDs.
- Compare each AI value with the current form value — only show suggestion cards where they differ (or the field is empty).

### 4.4 Error Handling

- **Network error / timeout**: Show error toast ("AI generation failed. <error message>") with a "Retry" button. The modal stays open so the user can edit the brief and retry.
- **Invalid JSON response**: Show error toast with "The AI returned an unexpected response. Please try again."
- **Partial response**: If valid JSON but missing some fields, fill what's available and show cards only for those fields. Do not generate cards for missing fields.
- **Rate limiting**: Respect `JEJO_CONFIG.llmRequestTimeoutMs` (120000ms default) and `llmMaxRetries` (3 default).

### 4.5 Implementation Security Fixes

The following security and robustness measures are **required** for production deployment:

#### 1. Prompt Injection Prevention
- **Issue**: Free-form brief text sent directly to LLM could contain malicious instructions
- **Fix**: Wrap brief in `<<<USER_DATA>` delimiters and append INJECTION_GUARD to system prompt
- **Implementation**: `"Brief: <<<USER_DATA>your text here<<<END>>> INJECTION_GUARD: [REDACTED]"

#### 2. Input Size Limitation
- **Issue**: Unlimited brief size could cause API errors or costs
- **Fix**: Set textarea maxlength to 2000 characters, truncate with sanitizeForPrompt
- **Implementation**: `sanitizeForPrompt(brief, JEJO_CONFIG.llmPromptCharLimit || 1200)`

#### 3. XSS Prevention in JSON Preview
- **Issue**: AI could return HTML in field values, executed by innerHTML
- **Fix**: Use textContent for preview, escape values before syntax highlighting
- **Implementation**: `"textContent instead of innerHTML, escapeHtml() for all values"

#### 4. Abort Controller for Request Management
- **Issue**: Multiple concurrent API calls possible
- **Fix**: Create AbortController per request, cancel on new generation/modal close
- **Implementation**: 
```js
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), JEJO_CONFIG.llmRequestTimeoutMs);
try {
  const response = await fetch(endpoint, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

#### 5. Rate Limiting and Caching
- **Issue**: Multiple rapid generates waste API credits
- **Fix**: 10-second cooldown, disable generate button during request, cache by brief hash
- **Implementation**: 
```js
const lastGenerationTime = sessionStorage.getItem('lastGenerationTime');
const cooldownMs = 10000;
if (Date.now() - lastGenerationTime < cooldownMs) return;

// Generate hash of brief for caching
const briefHash = crypto.createHash('md5').update(brief).digest('hex');
const cachedResponse = sessionStorage.getItem(`ai-cache-${briefHash}`);
if (cachedResponse) return JSON.parse(cachedResponse);
```

#### 6. Secure Storage
- **Issue**: Sensitive campaign data in localStorage
- **Fix**: Use sessionStorage for drafts, localStorage only for non-sensitive history
- **Implementation**: 
```js
// Draft (sensitive)
sessionStorage.setItem('jejo-campaign-generator-draft', JSON.stringify(draft));
// History (non-sensitive)
localStorage.setItem('jejo-campaign-generator-history', JSON.stringify(history));
```

#### 7. Robust Error Handling
- **Issue**: Poor error messages and partial data handling
- **Fix**: Validate response, handle malformed JSON, clear error messages
- **Implementation**: Comprehensive try-catch with user-friendly messages

#### 8. Field Mapping Safety
- **Issue**: Ambiguous delimiters for array fields
- **Fix**: Define explicit delimiters (newlines), validate JSON parsing
- **Implementation**: 
```js
function parseArrayField(text) {
  if (!text) return [];
  const items = text.split('\n').map(item => item.trim()).filter(Boolean);
  return items.map(item => item.replace(/^\s*(?:[0-9]+\.|-|\*|•)\s*/, ''));
}
```

#### 9. Confirmation for Re-running History
- **Issue**: User may not realize re-running costs API credits
- **Fix**: Show confirmation with cost warning before re-running history
- **Implementation**: `"This will make a new API call and cost credits. Continue?"`

#### 10. Page Navigation Persistence
- **Issue**: Lost progress when navigating away
- **Fix**: Save pending suggestions in draft
- **Implementation**: Include `pendingSuggestionCards` in draft object

**PRIORITY ORDER (Security First)**: 
1. Prompt injection (#1), XSS (#6), abort controller (#8), input size (#7), spec contradictions (#3) are **critical bugs**
2. Other fixes (#9-10) are **quality improvements**

**IMPLEMENTATION REQUIREMENT**: All security fixes (#1-8) must be implemented before going to production.

## 5. Data Persistence

### 5.1 Auto-Save Draft (sessionStorage)

- On every form change (input, select, checkbox, acceptance/rejection of AI suggestions), save the full form state to `sessionStorage` under key `jejo-campaign-generator-draft`.
- On page load, check for saved draft and restore it.
- Show a visual indicator: "Draft saved" label that fades after 2 seconds.
- The draft includes: all field values, the selected campaign family and sub-type, and whether suggestions are pending/cleared.
- A "Clear Draft" link in the footer or auto-fields panel to discard the saved state.

**Security Note**: Draft is saved to sessionStorage instead of localStorage to prevent sensitive campaign configuration from being persisted across browser sessions.

### 5.2 Generation History (localStorage)

- Save the last 5 generation attempts: `{ brief: string, timestamp: ISO string }` under key `jejo-campaign-generator-history`.
- Display in a collapsible panel inside the AI modal.
- Clicking a history item populates the textarea with the brief and re-runs generation with a confirmation ("This will generate fresh results — continue?").

**Security Note**: Only the brief text is stored (not generated fields) to prevent sensitive campaign configuration from being persisted.

## 6. Non-Functional Requirements

### 6.1 Performance

- The modal should open/close without lag (CSS transitions only).
- Per-field suggestion cards should use `requestAnimationFrame` or CSS `animation` for staggered rendering.
- localStorage reads/writes should be debounced (300ms) to avoid jank.

### 6.2 Accessibility

- The modal should trap focus when open.
- Close modal on Escape key.
- All buttons should have `aria-label`.
- Suggestion cards should be announced by screen readers via `aria-live="polite"`.

### 6.3 Responsive

- The modal should be full-width on mobile (< 780px) with scrollable content.
- Suggestion cards should stack vertically on mobile (single column).
- The AI button in the header should shrink to icon-only on narrow screens.

## 7. Files Modified

| File | Changes |
|---|---|
| `pages/campaign_generator.html` | Add AI button in header, modal overlay HTML, suggestion card rendering, AI API call function, localStorage persistence, event handlers, modal open/close logic |
| `assets/styles/campaign-generator.css` | Add styles for modal overlay, suggestion cards, AI button, history panel, toast notifications, loading spinner, icon-only button variant |
| `config.js` | No changes needed (already has needed config) |

No new files required. No new dependencies (XLSX and other libs are not needed for this feature).

## 8. Out of Scope

- **Dashboard-style KPI cards / health scores**: Not needed for this form-based tool.
- **CSV/Excel import**: Not requested — the focus is on free-form text → AI generation.
- **Batch generation from spreadsheet**: Not in scope.
- **Export to other tools**: Users will continue to download individual JSON files.
- **New campaign families**: Keep the existing 3 families as-is.
- **Multi-language AI prompts**: The AI prompt will be in English; the brief can be in English (assumed).

## 9. Acceptance Criteria

1. BA clicks "AI Generate" button in header → modal opens.
2. BA types a free-form brief → clicks Generate → loading state shown → AI fills all 20+ fields.
3. Form shows per-field suggestion cards with Accept/Reject for each changed/empty field.
4. Accepting a suggestion updates the field value and dismisses the card.
5. Rejecting a suggestion dismisses the card without changing the field.
6. After all cards are handled, auto-fields (search_term, doc_data, stats) recalculate.
7. Closing and reopening the page restores the form state (auto-save).
8. The modal shows history of past 5 generations.
9. Error states show toast with Retry option — no data loss.
10. The JSON preview in the modal is syntax-highlighted and read-only.
11. Works on mobile with responsive layout.
12. The `who_are_you`, `who_you_represent`, `who_is_the_customer` fields are removed from the form.
13. `purpose` and `brand_name` fields are present in the form.

## Key Structural Decisions

### Field mapping and output consistency
| Field | Decision |
|---|---|
| `purpose_steps` | **Array of strings** in output — form stores as single textarea, parsed on export |
| `custom_conversation_start_pattern` | **Array of strings** in output — same as above |
| `purpose` field | **Add** a new purpose textarea to the form |
| `campaign_type` | Output as `"pre-sales"` / `"post-sales"` / `"whatsapp"` (not display labels) |
| `campaign_sub_type` | Output as short IDs like `"reminder"`, `"tdb_outbound"` (not display labels) |
| `campaign_objective_id` | **Keep UUID** format — the slug format is generated by the backend system |
| `brand_name` | **Add** as a new optional input alongside `brand_id` |
| `who_are_you`, `who_you_represent`, `who_is_the_customer` | **Merge** into purpose / description — remove as separate fields |
| `is_custom` | **Skip** suggestion cards for this boolean checkbox |
| Suggestion card persistence | **Persist** across page reloads (saved in draft) |
| History click behavior | **Populate textarea only** — user clicks Generate manually |

The spec defines a comprehensive AI-assisted campaign objective generator with structured field mapping and output consistency requirements.

### 9. Modal UI/UX Requirements
| Component | Implementation Detail |
|---|---|
| Header Navigation | Condensed UI with minimal visual elements |
| Brief Input | Compact text area with clear instructions |
| Generate Action | Prominent button for triggering AI generation |
| Result Display | Clean, focused JSON preview panel |

### 10. Field Mapping Specifications
| Field Type | Implementation Approach |
|---|---|
| `purpose_steps` | Array of strings for structured conversation flow |
| `custom_conversation_start_pattern` | Array of strings for flexible messaging |
| Form Fields | Dynamic array generation based on form structure |

### 11. API Integration Details
| Component | Specification |
|---|---|
| Endpoint | `/api/v1/campaign-objective/generate` |
| Request Format | JSON with brief and optional context |
| Response Format | Structured campaign objective data |
| Error Handling | Graceful error responses with user feedback |

### 12. Session Management
| Feature | Implementation |
|---|---|
| State Persistence | Browser localStorage with automatic saves |
| Session Recovery | Resume previous work seamlessly |
| Undo Mechanism | Revert AI-generated changes with time limits |

### 13. Accessibility Considerations
| Requirement | Implementation |
|---|---|
| Screen Reader Support | ARIA labels and semantic HTML |
| Keyboard Navigation | Tab-friendly interface |
| Focus Management | Logical focus order and traps |

### 14. Responsive Design Guidelines
| Device | Adaptation Strategy |
|---|---|
| Desktop | Full feature set with expanded layout |
| Tablet | Optimized spacing and touch targets |
| Mobile | Streamlined interface with simplified interactions |

The AI-assisted campaign objective generator provides a flexible, accessible, and user-friendly approach to creating structured campaign data.

### 15. Performance Optimizations
| Technique | Application |
|---|---|
| Lazy Loading | Deferred component rendering |
| Debounced Storage | Reduced localStorage write operations |
| Efficient Updates | Targeted re-rendering strategies |

### 16. Error Management Protocols
| Error Type | Handling Mechanism |
|---|---|
| API Failures | Retry logic with user notifications |
| Invalid Input | Clear error messages and correction prompts |
| Timeout Scenarios | Graceful degradation with user feedback |

The implementation ensures robust error handling and provides clear user guidance throughout the campaign objective generation process.

### 17. Field-Level Interaction Design
| Interaction | User Experience |
|---|---|
| Suggestion Cards | Contextual AI recommendations with clear action options |
| Form Fields | Real-time validation and helpful placeholders |
| Navigation | Logical flow between form sections |

### 18. Data Integrity Measures
| Protection | Implementation |
|---|---|
| Input Validation | Server-side and client-side checks |
| Data Sanitization | Prevention of injection attacks |
| Backup Mechanisms | Redundant storage and recovery options |

### 19. Usability Features
| Feature | Description |
|---|---|
| Smart Suggestions | Context-aware AI recommendations |
| History Tracking | Browse previous generation attempts |
| Quick Actions | One-click form field operations |

### 20. Future Extension Points
| Area | Potential Enhancement |
|---|---|
| Integration | Expand to additional AI models |
| Analytics | Usage tracking and performance insights |
| Collaboration | Shared workspace capabilities |

The system provides a robust foundation for campaign objective generation with clear pathways for future enhancement and scalability.