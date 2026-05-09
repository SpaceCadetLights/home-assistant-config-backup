# MONA — AI-Native Home Architecture
## LaunchPad Smart Home System

**Status:** Architecture plan — no functional changes made  
**Created:** 2026-05-09  
**HA Version:** 2026.4.4

---

## System Name: MONA

**MONA** (Modular, Orchestrated, Native AI) is the name for the LaunchPad AI home system. It represents the integrated stack of local hardware, cloud AI, voice pipelines, and Cursor-based engineering that runs the home.

---

## Current AI Stack Inventory

| Layer | Component | Type | Status |
|-------|-----------|------|--------|
| Voice hardware | HA Voice (0aab68) | Official HA satellite | Active |
| Voice hardware | ESPHome assist-microphone | Custom ESPHome mic | Active |
| Wake word | openWakeWord | Local | Installed |
| Wake words active | "Hey Jarvis" (primary) + "Hey Mycroft" (secondary) | — | Active |
| STT — local | faster-whisper | Local (on HA host) | Available |
| STT — cloud | OpenAI STT | OpenAI cloud | Available |
| STT — cloud | Homeway Sage | Homeway cloud | Available |
| STT — cloud | HA Cloud | Nabu Casa | Available |
| TTS — local | Piper | Local (on HA host) | **Active — last used** |
| TTS — cloud | OpenAI TTS | OpenAI cloud | Available |
| TTS — cloud | Homeway Sage TTS | Homeway cloud | Available |
| TTS — cloud | Google Translate | Google cloud | Available |
| TTS — cloud | HA Cloud | Nabu Casa | Available |
| Conversation pipeline A | "Sage" | Homeway (ChatGPT/Gemini) | Active on both satellites |
| Conversation pipeline B | "Home Assistant GPT" | OpenAI Conversation | Active on HA Voice satellite |
| Conversation — built-in | Home Assistant | HA built-in NLP | Available |
| Engineering agent | Cursor + Homeway MCP | AI coding agent | Active |
| Voice assistant bridge | Alexa (Homeway) | Cloud voice | Active |
| Voice assistant bridge | Google Assistant (Homeway) | Cloud voice | Active |
| AI task | OpenAI AI Task | Automation-triggered AI | Available |

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────┐
                    │           MONA SYSTEM                   │
                    │                                         │
  "Hey Jarvis" ──► │  ┌─────────────┐  ┌──────────────────┐ │
  "Hey Mycroft" ──►│  │ HA Voice    │  │ ESPHome Mic       │ │
                    │  │ Satellite   │  │ (assist-mic)      │ │
                    │  └──────┬──────┘  └────────┬─────────┘ │
                    │         │                  │            │
                    │         └────────┬─────────┘            │
                    │                  ▼                       │
                    │  ┌───────────────────────────────────┐  │
                    │  │     Assist Pipeline Router        │  │
                    │  │  Wake → STT → Intent → TTS        │  │
                    │  └──────┬──────────────┬─────────────┘  │
                    │         │              │                 │
                    │    [Local path]  [Cloud path]           │
                    │         │              │                 │
                    │  ┌──────▼────┐  ┌─────▼────────────┐   │
                    │  │ Whisper   │  │ Homeway Sage /    │   │
                    │  │ (STT)     │  │ OpenAI STT        │   │
                    │  │ Piper     │  │ OpenAI TTS /      │   │
                    │  │ (TTS)     │  │ Homeway TTS       │   │
                    │  └──────┬────┘  └─────┬─────────────┘   │
                    │         └──────┬───────┘                 │
                    │                ▼                         │
                    │  ┌────────────────────────────────────┐ │
                    │  │     Conversation Agent              │ │
                    │  │  HA Built-in / Sage / OpenAI GPT   │ │
                    │  └────────────────────────────────────┘ │
                    │                ▼                         │
                    │  ┌────────────────────────────────────┐ │
                    │  │   Home Assistant Core              │ │
                    │  │   (entity control, automations)    │ │
                    │  └────────────────────────────────────┘ │
                    │                                         │
                    │  ┌────────────────────────────────────┐ │
                    │  │   Cursor (Engineering Agent)       │ │
                    │  │   ← Homeway MCP →                  │ │
                    │  └────────────────────────────────────┘ │
                    └─────────────────────────────────────────┘
```

---

## Voice Pipeline Strategy

### Recommended Pipeline Configuration

#### Pipeline 1: MONA Local (fastest, primary)
| Stage | Component | Notes |
|-------|-----------|-------|
| Wake word | openWakeWord ("Hey Jarvis") | Local, ~50–100ms |
| STT | faster-whisper | Local, ~200–600ms depending on utterance |
| Conversation | HA Built-in | Local, <50ms for device commands |
| TTS | Piper | Local, ~100–300ms |
| **Total** | **~400–1050ms** | Fully air-gapped |

> Best for: lights, switches, scenes, media control — anything HA can handle natively.

#### Pipeline 2: MONA Smart (balanced, secondary)
| Stage | Component | Notes |
|-------|-----------|-------|
| Wake word | openWakeWord ("Hey Mycroft") | Local |
| STT | faster-whisper | Local |
| Conversation | OpenAI Conversation / Homeway Sage | Cloud, adds ~400–1500ms |
| TTS | Piper | Local |
| **Total** | **~800–2500ms** | Cloud only for the AI response |

> Best for: complex natural language, questions, multi-step tasks, ambiguous requests.

#### Fallback: Cloud-only (Alexa/Google via Homeway)
For users who prefer Alexa or Google ecosystem voice control. No latency optimization needed — these run their own pipelines.

### Current Pipeline State
- Both satellites use pipeline "Sage" as primary → this routes through Homeway cloud for STT
- **Recommended change:** Switch primary pipeline to fully local (Whisper + Piper + HA built-in) for device commands; keep Sage as secondary for complex queries
- This single change would reduce routine command latency from ~1–3s to ~400–1000ms

---

## Role of Each Component

### Home Assistant Voice Satellite (HA Voice 0aab68)
- **Role:** Primary always-on room listener
- **Location:** Should be placed in the most frequently used room (Lounge or Stage)
- **Capabilities:** Dual wake words, dual pipeline selection, button press events, LED ring feedback, media playback
- **Strengths:** Official hardware, reliable, good microphone, visual feedback via LED ring
- **Limitations:** One physical device; wake word coverage limited to its room

### ESPHome Assist Microphone (assist-microphone)
- **Role:** Secondary/supplemental listener; currently uses pipeline "Sage"
- **Capabilities:** Adjustable auto-gain (7), noise suppression (low), mic volume (1.5)
- **Strengths:** Customizable, cheap to replicate in any room
- **Recommended expansion:** Clone the ESPHome config to add room-specific microphones in Workshop, Stage, and Kitchen

### openWakeWord
- **Role:** Local wake word detection (no cloud required)
- **Current:** Installed and active
- **Wake words:** "Hey Jarvis" (HA Voice primary), "Hey Mycroft" (secondary)
- **Recommended:** Keep "Hey Jarvis" as the primary house wake word for consistency

### faster-whisper (Local STT)
- **Role:** Transcribe speech to text locally
- **Current:** Available but not necessarily the active STT in the "Sage" pipeline
- **Strength:** Private, fast on capable hardware, no API cost
- **Model selection:** Use `small` or `medium` model for best speed/accuracy tradeoff on a mini PC

### Piper (Local TTS)
- **Role:** Convert AI responses to speech locally
- **Current:** Active — last used TTS engine in the system
- **Voices:** Multiple English voices available; choose a natural-sounding voice
- **Latency:** 100–300ms per response sentence — excellent

### Homeway Sage (Cloud)
- **Role:** Bundled AI assistant via Homeway — provides ChatGPT/Gemini/Claude for voice queries
- **Strength:** Zero additional API cost through Homeway plan; multi-model
- **Limitation:** Cloud round-trip adds 400–1500ms; dependent on Homeway uptime
- **Use for:** Complex queries, general knowledge, anything beyond HA entity control

### OpenAI Conversation + STT/TTS
- **Role:** Direct OpenAI integration for highest-quality AI responses and voices
- **Strength:** Best response quality; OpenAI TTS voices are very natural
- **Cost:** API usage billed; avoid for routine device commands
- **Use for:** Complex automations, AI task triggers, ElevenLabs-quality TTS when quality matters

### Cursor as Engineering Agent (via Homeway MCP)
- **Role:** The safe, deliberate engineering layer — writes config, proposes automations, audits the system
- **How it works:** Cursor connects to HA via Homeway MCP, queries live state, reads/writes config files in `/config`, proposes changes for human approval
- **NOT for:** Real-time automation, autonomous device control without human in the loop
- **IS for:** Config generation, package creation, documentation, auditing, dashboard design, automation drafting

---

## Safe Permission Boundaries

### What MONA Can Do Automatically (No Confirmation)

| Action | Example |
|--------|---------|
| Control lights, switches, media players | "Turn off the workshop lights" |
| Set WLED effects and colors | "Set Trillium to rainbow" |
| Read entity states | "Is the basement light on?" |
| Trigger named scenes | "Activate stage performance mode" |
| Adjust media volume | "Turn up the music" |
| Set timers | "Set a 30-minute timer" |
| Report weather, time, sensor values | "What's the temperature?" |

### What Requires Confirmation Before Acting

| Action | Reason |
|--------|--------|
| Restart Home Assistant | Disruptive — affects the whole system |
| Reload automations/YAML | Could break things if config has errors |
| Lock/unlock entry | Security risk |
| Disable automations | Potentially confusing to reverse |
| Send notifications to other people | Privacy |
| Modify `configuration.yaml` | Structural risk |
| Touch Homeway/MCP config | Could break the AI connection itself |
| Purchase/subscription actions | Financial |

### What MONA Should Never Do

- Expose secrets, tokens, API keys in any response
- Delete files
- Execute arbitrary shell commands
- Bypass user confirmation for security actions
- Modify its own permission boundaries

---

## Recommended Implementation Phases

### Phase 1 — Optimize Local Voice (highest impact, low risk)
1. Create a fully local pipeline: faster-whisper + Piper + HA built-in conversation
2. Assign it as the primary pipeline on both satellites
3. Keep "Sage" as secondary (wake word 2 or voice button press)
4. Measure latency improvement

### Phase 2 — Room Coverage
1. Flash additional ESPHome microphones for Workshop, Kitchen, Stage
2. Assign area-aware pipelines (Workshop mic → Workshop context)
3. Consider HA Voice mini units for Bathroom and Lounge

### Phase 3 — AI Integration Depth
1. Build `ai_task` triggers for complex automations (e.g., "good morning routine" via OpenAI)
2. Connect OpenAI AI Task to scene and WLED orchestration
3. Define voice-triggered scripts that are too complex for built-in NLP

### Phase 4 — Cursor as Engineering Agent
1. Establish a recurring review session (weekly/monthly) where Cursor audits the config
2. Use the AI to draft new automations, test with traces, migrate to packages
3. Keep `docs/` updated after every significant change

---

## Latency Bottlenecks (Summary)

| Stage | Local | Cloud |
|-------|-------|-------|
| Wake detection | ~50–100ms | N/A |
| STT transcription | ~200–600ms | ~400–1200ms |
| Conversation processing | ~20–100ms | ~400–2000ms |
| TTS generation | ~100–300ms | ~200–800ms |
| **Total round-trip** | **~400–1100ms** | **~1000–4000ms** |

> The single biggest win is switching from cloud STT (Sage/OpenAI) to local faster-whisper for routine commands. This alone can cut latency by 50–70%.

---

## Questions That Would Materially Affect Implementation

1. **Which room should the HA Voice satellite live in?** This determines where "Hey Jarvis" is most useful.
2. **Is there a Nabu Casa / Home Assistant Cloud subscription active?** If yes, cloud STT/TTS is zero additional cost.
3. **What OpenAI model is configured for the OpenAI Conversation integration?** GPT-4o-mini is 3–5× faster than GPT-4o for voice.
4. **Are there plans for additional HA Voice satellites, or will ESPHome mics cover new rooms?**
5. **Is ElevenLabs actively used?** It was mentioned but no ElevenLabs integration was found — clarify if planned.
