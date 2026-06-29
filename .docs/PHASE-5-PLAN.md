# Фаза 5 — implementation plan

## Шаги

1. Добавить DTO:
   - `shared/dto/voice.ts`;
   - экспорт из `shared/dto/index.ts`.

2. Расширить runtime config:
   - `public.speechDefaultEngine`;
   - `public.featureTtsEnabled`;
   - `realtimeModel`;
   - `realtimeVoice`;
   - `ttsModel`;
   - `ttsVoice`.

3. Написать failing tests:
   - `app/composables/useVoiceDictationInput.test.ts`;
   - `server/application/realtime/realtimeConfig.test.ts`;
   - `server/application/tts/ttsConfig.test.ts`.

4. Реализовать dictation:
   - `app/composables/speech/types.ts`;
   - `app/composables/speech/engine.webspeech.ts`;
   - `app/composables/useSpeechEngine.ts`;
   - `app/composables/useVoiceDictationInput.ts`;
   - `app/composables/useMicPermissionGate.ts`;
   - `app/stores/speech.ts`;
   - `app/components/VoiceInput.vue`.

5. Реализовать TTS:
   - `server/application/tts/ttsConfig.ts`;
   - `server/api/tts/openai.post.ts`;
   - `app/composables/useTTS.ts`.

6. Реализовать Realtime:
   - `server/application/realtime/realtimeConfig.ts`;
   - `server/api/realtime/session.post.ts`;
   - `app/services/realtime/realtimeWebrtcClient.ts`;
   - `app/composables/useRealtimeVoiceSession.ts`;
   - `app/stores/realtimeVoiceUi.ts`;
   - `app/components/realtime/RealtimeVoicePanel.vue`.

7. Интегрировать в интервью:
   - `app/pages/interview/[id].vue`;
   - i18n строки в `app/i18n/locales/ru.json`;
   - env keys в `.env.example`.

8. Проверить:
   - targeted tests for phase 5;
   - `pnpm test:run`;
   - `pnpm typecheck`;
   - `pnpm build`;
   - smoke через dev server.
