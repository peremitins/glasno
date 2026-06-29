# Фаза 5 — дизайн реализации

## Цель

Добавить голосовой слой к уже работающему текстовому интервью: пользователь может надиктовать ответ в textarea, включить озвучку вопроса и открыть realtime-режим разговора через OpenAI Realtime API.

## Границы фазы

Входит:
- Web Speech dictation для textarea;
- общий `speech` store и `useSpeechEngine`;
- `useVoiceDictationInput` с защитой от дублирования cumulative transcript;
- `VoiceInput.vue` как компактный control block;
- `useMicPermissionGate` для browser permissions;
- TTS через server endpoint `/api/tts/openai`;
- `useTTS` на клиенте с abort/stop;
- Realtime session endpoint с ephemeral client secret;
- browser WebRTC client layer и `useRealtimeVoiceSession`;
- `realtimeVoiceUi` store;
- панель управления голосом на странице интервью.

Не входит:
- Capacitor/native speech;
- Whisper fallback и серверная STT-транскрибация;
- запись realtime-разговора в `interview_turns` без явного пользовательского действия;
- сложный Zoom UI из фазы 6;
- Yandex SpeechKit HTTP-интеграция как основной путь. Env-ключи оставляем, но текущий TTS endpoint использует OpenAI.

## Архитектура

### Dictation

- `app/composables/speech/types.ts` — интерфейс speech engine.
- `app/composables/speech/engine.webspeech.ts` — браузерный `SpeechRecognition`.
- `app/composables/useSpeechEngine.ts` — singleton dispatcher для partial/final/error.
- `app/composables/useVoiceDictationInput.ts` — привязка engine к конкретной textarea.
- `app/stores/speech.ts` — engine/language/silence/listening state.
- `app/components/VoiceInput.vue` — UI управления диктовкой.

`useVoiceDictationInput` владеет объединением текста. Это важно: mobile Web Speech может вернуть весь накопленный transcript ещё раз, поэтому delta extraction нельзя делать в engine.

### TTS

- `shared/dto/voice.ts` — DTO TTS/realtime API.
- `server/api/tts/openai.post.ts` — thin endpoint, validation через DTO, OpenAI key только на сервере.
- `app/composables/useTTS.ts` — singleton audio playback и abort предыдущего запроса.

TTS выключается флагом `NUXT_FEATURE_TTS_ENABLED`. Если флаг выключен, API возвращает `E_FORBIDDEN`, а клиентская кнопка остаётся disabled.

### Realtime

- `server/application/realtime/realtimeConfig.ts` — сборка инструкций и session payload.
- `server/api/realtime/session.post.ts` — создаёт ephemeral client secret через OpenAI.
- `app/services/realtime/realtimeWebrtcClient.ts` — browser-only WebRTC transport.
- `app/composables/useRealtimeVoiceSession.ts` — lifecycle, errors, start/stop.
- `app/stores/realtimeVoiceUi.ts` — статус панели.

Браузер получает только ephemeral secret. Серверный `NUXT_OPENAI_API_KEY` не уходит на клиент.

## UX

На странице интервью:
- рядом с вопросом — кнопка озвучки;
- под textarea — компактный блок диктовки;
- ниже — realtime voice panel с кнопками start/stop и статусом.

Текстовый сценарий остаётся главным и не ломается: пользователь всё равно видит textarea и вручную отправляет финальный ответ.

## Проверки

- unit-тест delta extraction для cumulative transcript;
- unit-тест Realtime session payload/instructions;
- unit-тест TTS config gate;
- `pnpm test:run`;
- `pnpm typecheck`;
- `pnpm build`;
- HTTP smoke для `/api/tts/openai` disabled state и `/api/realtime/session`.
