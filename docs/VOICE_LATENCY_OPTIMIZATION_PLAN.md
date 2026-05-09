# Voice Latency Optimization Plan — LaunchPad / MONA

**Status:** Analysis and recommendations — no pipeline changes made  
**Created:** 2026-05-09  
**Hardware:** Mini PC running HA OS + HA Voice satellite (0aab68) + ESPHome assist-mic

---

## Current Voice Stack (Discovered)

| Component | Current Config | Local? |
|-----------|---------------|--------|
| Wake word detection | openWakeWord ("Hey Jarvis" / "Hey Mycroft") | ✅ Local |
| STT — pipeline "Sage" | Homeway Sage STT | ❌ Cloud |
| STT — available | faster-whisper | ✅ Local |
| STT — available | OpenAI STT | ❌ Cloud |
| STT — available | HA Cloud | ❌ Cloud |
| Conversation — "Sage" | Homeway (ChatGPT/Gemini) | ❌ Cloud |
| Conversation — "HA GPT" | OpenAI Conversation | ❌ Cloud |
| Conversation — built-in | HA NLP | ✅ Local |
| TTS — last used | Piper | ✅ Local |
| TTS — available | OpenAI TTS, Homeway TTS, Google Translate | ❌ Cloud |
| Finished speaking detection | "relaxed" on HA Voice, "default" on ESPHome mic | — |

**Key finding:** The fastest possible local stack is already installed but not fully configured as the primary pipeline. Switching to a fully local primary pipeline is the single highest-impact optimization.

---

## Latency Breakdown by Pipeline Stage

### Stage 1: Wake Word Detection
- **Component:** openWakeWord (local)
- **Latency:** ~50–100ms
- **Network:** None
- **Notes:** Already local, already fast. No change needed.

### Stage 2: Audio Capture + VAD (Voice Activity Detection)
- **Component:** HA Voice hardware / ESPHome mic firmware
- **Latency:** ~100–200ms (capture + end-of-speech detection)
- **Tunable:** `finished_speaking_detection` setting on each satellite
  - `relaxed` = waits longer for pauses → more natural, more latency
  - `default` = faster cutoff → sometimes cuts off speech
- **Recommendation:** Keep `relaxed` on HA Voice; switch ESPHome mic to `relaxed` as well for consistency

### Stage 3: STT (Speech-to-Text)
This is the biggest variable.

| STT Engine | Type | Latency | Quality | Cost |
|------------|------|---------|---------|------|
| **faster-whisper (small)** | Local | 200–500ms | Good | Free |
| **faster-whisper (medium)** | Local | 400–900ms | Excellent | Free |
| **faster-whisper (large)** | Local | 800–2000ms | Best | Free |
| OpenAI Whisper API | Cloud | 500–1500ms | Excellent | Paid |
| HA Cloud STT | Cloud | 400–1200ms | Good | Subscription |
| Homeway Sage STT | Cloud | 500–1500ms | Good | Free via Homeway |

**Current default (Sage pipeline):** Homeway cloud STT → adds 500–1500ms vs local  
**Recommended:** `faster-whisper` with `small` or `medium` model as primary  
**Model selection note:** On a capable mini PC, `medium` model runs in ~400–700ms and is significantly more accurate than `small` for accents or background noise.

### Stage 4: Conversation / Intent Processing

| Agent | Type | Latency | Capability |
|-------|------|---------|-----------|
| **HA Built-in NLP** | Local | 20–80ms | HA entity commands only |
| OpenAI GPT-4o-mini | Cloud | 400–900ms | Full LLM |
| OpenAI GPT-4o | Cloud | 800–2500ms | Best quality |
| Homeway Sage | Cloud | 500–2000ms | Multi-model (GPT/Gemini/Claude) |

**Key insight:** For 80% of voice commands ("turn off the lights", "play Spotify", "set Trillium to rainbow"), the built-in HA NLP is sufficient and runs in <100ms. The full LLM is only needed for complex or ambiguous requests.

**Recommendation:** Route through built-in NLP first; fall back to cloud LLM only when HA NLP returns "I don't understand."

### Stage 5: TTS (Text-to-Speech)
| TTS Engine | Type | Latency | Quality |
|------------|------|---------|---------|
| **Piper** | Local | 100–300ms | Good (improving) |
| Google Translate | Cloud | 200–600ms | Natural |
| HA Cloud TTS | Cloud | 200–800ms | Natural |
| Homeway TTS | Cloud | 300–900ms | Natural |
| OpenAI TTS | Cloud | 300–1000ms | Excellent |

**Current:** Piper (local) is already active — this is optimal.  
**Piper voice selection:** Use `en_US-lessac-medium` or `en_US-amy-medium` for best clarity. Avoid `low` quality models — the latency difference is minimal but quality is noticeably worse.

---

## Proposed Pipeline Configurations

### Pipeline A: MONA Fast (Recommended Primary)

```
Wake word:  openWakeWord "Hey Jarvis"     →  Local  ~75ms
STT:        faster-whisper (medium)       →  Local  ~500ms
Intent:     HA Built-in conversation      →  Local  ~50ms
TTS:        Piper (en_US-lessac-medium)   →  Local  ~200ms
─────────────────────────────────────────────────────────
Total:      ~825ms typical                   Fully local
```

Best for: All standard device control. Works with no internet.

### Pipeline B: MONA Smart (Secondary — "Hey Mycroft")

```
Wake word:  openWakeWord "Hey Mycroft"    →  Local   ~75ms
STT:        faster-whisper (medium)       →  Local   ~500ms
Intent:     OpenAI GPT-4o-mini            →  Cloud  ~700ms
TTS:        Piper                         →  Local   ~200ms
─────────────────────────────────────────────────────────
Total:      ~1475ms typical                  Cloud for AI only
```

Best for: Natural language, questions, complex requests.

### Pipeline C: MONA Pro (On demand — voice button press on HA Voice)

```
Wake word:  HA Voice button press
STT:        OpenAI Whisper API            →  Cloud  ~800ms
Intent:     OpenAI GPT-4o                →  Cloud  ~1500ms
TTS:        OpenAI TTS (alloy/nova)      →  Cloud  ~500ms
─────────────────────────────────────────────────────────
Total:      ~2800ms typical                  Full cloud quality
```

Best for: When you want the highest-quality AI response and aren't in a hurry.

---

## Current Sage Pipeline Limitations

| Limitation | Impact |
|------------|--------|
| Cloud STT dependency | +500–1500ms on every command |
| Cloud conversation | +500–2000ms for every response |
| Homeway service outage | Full voice failure |
| Internet outage | Full voice failure |
| API rate limits (Homeway free tier) | Throttling during heavy use |

**Sage is still valuable** — keep it as secondary. The goal is not to remove it, but to stop using it as the default for routine device commands.

---

## Likely Bottlenecks in Current Setup

1. **STT is cloud (Sage pipeline)** — biggest latency source. faster-whisper is available and unused as primary.
2. **Conversation is cloud (Sage pipeline)** — adds 500–2000ms for commands that built-in NLP could handle in <100ms.
3. **ESPHome mic noise suppression is `low`** — may cause faster-whisper to work harder on noisy audio. Try `medium` suppression with faster-whisper.
4. **`finished_speaking_detection: default` on ESPHome mic** — may cut off speech prematurely. Switch to `relaxed`.
5. **Piper voice quality** — if using a `low` quality voice, switch to `medium` for better clarity at similar latency.

---

## When to Use Local vs Cloud Voice

| Scenario | Recommended Pipeline |
|----------|---------------------|
| Lights on/off | MONA Fast (local) |
| Scene activation | MONA Fast (local) |
| Media control | MONA Fast (local) |
| WLED effects | MONA Fast (local) |
| Timers/reminders | MONA Fast (local) |
| "What's the weather?" | MONA Smart (cloud LLM) |
| "Play something relaxing" | MONA Smart (cloud LLM → Music Assistant) |
| "Write me an automation for..." | Cursor (engineering agent) |
| Complex multi-step requests | MONA Smart or MONA Pro |
| Internet down | MONA Fast only (fully local) |

---

## Suggested Fallback Behavior

Configure HA voice pipeline with fallback:
1. Try built-in NLP first
2. If confidence below threshold → route to Sage (cloud LLM)
3. If cloud unavailable → respond with "I didn't catch that, try rephrasing" via Piper

This is not natively supported in HA pipeline config yet, but can be approximated by:
- Running built-in NLP as primary conversation agent
- Creating a script that catches "Sorry, I couldn't understand" responses and re-routes

---

## Tests to Measure Latency

### Test 1: End-to-End Command Latency
```
Method: Say "Hey Jarvis, turn off the lounge lamp"
Measure: Time from wake word detected to light state change in HA
Tool: HA Logbook + timestamp comparison, or Traces
```

### Test 2: STT-Only Latency
```
Method: Developer Tools → Assist → type a query (bypasses STT)
Compare: With voice input using STT
Delta = STT latency
```

### Test 3: Pipeline Comparison
```
Procedure:
  1. Record 10 identical commands on current Sage pipeline → note timestamps
  2. Switch to MONA Fast pipeline
  3. Record same 10 commands → compare timestamps
```

### Test 4: faster-whisper Model Size Comparison
```
Procedure: Run the same 5 utterances with small/medium/large models
Compare: Transcription time (in HA logs) vs accuracy
```

### Test 5: TTS Latency
```
Method: automation.trigger a TTS announcement → measure time to audio output
Compare: Piper vs Homeway TTS vs OpenAI TTS
```

---

## ElevenLabs Consideration

ElevenLabs was mentioned as a potential TTS but is not currently integrated in HA. If added:

- **Latency:** 500–1500ms (cloud API, requires audio streaming)
- **Quality:** Excellent — best available neural TTS
- **Recommendation:** Use only for non-real-time applications (announcements, notifications, creative content) — not for interactive voice assistant responses where latency matters
- **Integration path:** Add via HACS ElevenLabs TTS custom component, assign to Pipeline C (MONA Pro)

---

## Implementation Priority

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Create MONA Fast pipeline (Whisper + Piper + HA NLP) | Low | **High** |
| 2 | Set MONA Fast as primary on both satellites | Low | **High** |
| 3 | Set MONA Smart as secondary (Hey Mycroft) | Low | High |
| 4 | Switch ESPHome mic to `relaxed` VAD | Low | Medium |
| 5 | Upgrade Piper voice to `medium` quality | Low | Medium |
| 6 | Test faster-whisper model size (small vs medium) | Low | Medium |
| 7 | Add more room microphones (ESPHome clones) | Medium | High |
| 8 | Add ElevenLabs for announcement TTS | Medium | Low |
| 9 | Configure LLM fallback behavior | Medium | Medium |

---

*No pipelines, satellites, or integrations have been modified. All changes require explicit approval.*
