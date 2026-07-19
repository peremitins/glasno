import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildRealtimeCancelEvents,
  collectSupersededAudioResponseIds,
  createRealtimeStartGuard,
  shouldDeferRealtimeIdleStop,
  shouldPhysicallyMuteRealtimeMicrophone,
  withRealtimeSessionInstructions,
} from './useRealtimeVoiceSession';

const source = readFileSync('app/composables/useRealtimeVoiceSession.ts', 'utf8');

describe('useRealtimeVoiceSession helpers', () => {
  it('invalidates an in-flight realtime start after shutdown', () => {
    const guard = createRealtimeStartGuard();
    const firstStart = guard.begin();

    expect(guard.isCurrent(firstStart)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(firstStart)).toBe(false);

    const nextStart = guard.begin();
    expect(guard.isCurrent(nextStart)).toBe(true);
    expect(guard.isCurrent(firstStart)).toBe(false);
  });

  it('mutes outgoing microphone chunks during assistant output in Firefox', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0'
      )
    ).toBe(true);
  });

  it('uses physical microphone mute in Chromium browsers', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      )
    ).toBe(true);
  });

  it('does not physically disable the microphone track in Safari WebRTC sessions', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
      )
    ).toBe(false);
  });

  it('defers idle stop while assistant output is still active', () => {
    expect(shouldDeferRealtimeIdleStop(1)).toBe(true);
    expect(shouldDeferRealtimeIdleStop(0)).toBe(false);
  });

  it('defers idle stop while assistant audio is still playing after response.done', () => {
    // response.done может прийти раньше, чем WebRTC-аудио реально доиграло.
    // В этот момент mute-набор уже может быть пустым, но полной тишины ещё нет.
    expect(shouldDeferRealtimeIdleStop(0, false, true)).toBe(true);
  });

  it('defers idle stop while the user is still speaking', () => {
    // Длинный монолог: сегмент речи открыт — сессию не рвём по тишине.
    expect(shouldDeferRealtimeIdleStop(0, true)).toBe(true);
    // Речь закончилась и ассистент молчит — можно отсчитывать тишину.
    expect(shouldDeferRealtimeIdleStop(0, false)).toBe(false);
    // Ассистент отвечает — откладываем независимо от речи пользователя.
    expect(shouldDeferRealtimeIdleStop(1, false)).toBe(true);
  });

  it('tracks user speech segments to gate the idle timeout', () => {
    expect(source).toContain("type === 'input_audio_buffer.speech_started'");
    expect(source).toContain("type === 'input_audio_buffer.speech_stopped'");
    expect(source).toContain('userIsSpeaking = true');
    expect(source).toContain('userIsSpeaking = false');
    expect(source).toContain(
      'shouldDeferRealtimeIdleStop(\n          assistantMicrophoneMuteResponseIds.size,\n          userIsSpeaking,\n          assistantOutputIsActive\n        )'
    );
  });

  it('treats assistant audio playback as realtime activity', () => {
    expect(source).toContain('onAssistantAudioActivity()');
    expect(source).toContain('void registerRealtimeActivity();');
  });

  it('treats a cleared output audio buffer as the end of assistant audio', () => {
    // Перебивание (или клиентский clear) очищает WebRTC-буфер: сервер шлёт
    // output_audio_buffer.cleared, а stopped не придёт уже никогда. Если
    // cleared не снимает mute-заявку, микрофон остаётся выключенным навсегда,
    // а idle-стоп вечно откладывается — сессия «молчит», пока её не перезапустят.
    expect(source).toContain("type === 'output_audio_buffer.cleared'");
  });

  it('unmutes stale audio responses when a new response starts playing', () => {
    // Аудиобуфер один на сессию: старт озвучки нового ответа значит, что
    // прежние уже не звучат, даже если их терминальные события потерялись.
    expect(
      collectSupersededAudioResponseIds(['response_1', 'response_2'], 'response_2')
    ).toEqual(['response_1']);
    expect(
      collectSupersededAudioResponseIds(['response_1'], 'response_1')
    ).toEqual([]);
    expect(collectSupersededAudioResponseIds([], 'response_1')).toEqual([]);
    // Без id нового ответа прежние заявки не трогаем: нет доказательства,
    // что их звук закончился.
    expect(
      collectSupersededAudioResponseIds(['response_1'], '')
    ).toEqual([]);
    expect(source).toContain('collectSupersededAudioResponseIds(');
  });

  it('builds cancel events for active responses with WebRTC audio flush', () => {
    expect(
      buildRealtimeCancelEvents({
        activeResponseIds: ['response_1', 'response_2'],
        websocketTransport: false,
      })
    ).toEqual([
      { type: 'response.cancel', response_id: 'response_1' },
      { type: 'response.cancel', response_id: 'response_2' },
      { type: 'response.cancel' },
      { type: 'output_audio_buffer.clear' },
    ]);
  });

  it('skips WebRTC audio flush for the websocket transport', () => {
    expect(
      buildRealtimeCancelEvents({
        activeResponseIds: [],
        websocketTransport: true,
      })
    ).toEqual([{ type: 'response.cancel' }]);
  });

  it('does not stop realtime voice merely because the tab becomes hidden', () => {
    expect(source).toContain("window.addEventListener('pagehide'");
    expect(source).not.toContain('visibilitychange');
    expect(source).not.toContain('visibilityState');
  });

  it('restores the browser audio session on every realtime shutdown path', () => {
    expect(source).toContain('activateRealtimeAudioSession()');
    expect(source).toContain('releaseRealtimeAudioSession');
    expect(source).toContain('resetRealtimeAudioSession();');
    expect(source.match(/resetRealtimeAudioSession\(\);/g)?.length).toBeGreaterThanOrEqual(
      3
    );
    expect(source).toContain('const startToken = realtimeStartGuard.begin()');
    expect(
      source.match(/realtimeStartGuard\.isCurrent\(startToken\)/g)?.length
    ).toBeGreaterThanOrEqual(4);
    expect(source).toContain('nextClient.stop();');

    const stopFunction = source.slice(source.indexOf('async function stop('));
    expect(stopFunction.indexOf('client.value?.stop();')).toBeLessThan(
      stopFunction.indexOf('resetRealtimeAudioSession();')
    );
    expect(stopFunction.indexOf('resetRealtimeAudioSession();')).toBeLessThan(
      stopFunction.indexOf('await endServerSession(reason)')
    );
  });

  it('keeps the full session role contract in response-level overrides', () => {
    expect(
      withRealtimeSessionInstructions(
        {
          type: 'response.create',
          response: {
            instructions: 'Краткий bridge-контекст текущего вопроса.',
          },
        },
        'Ты голосовой интервьюер. Никогда не отвечай вместо кандидата.'
      )
    ).toEqual({
      type: 'response.create',
      response: {
        instructions:
          'Ты голосовой интервьюер. Никогда не отвечай вместо кандидата.\n\nКраткий bridge-контекст текущего вопроса.',
      },
    });
  });

  it('does not carry the initial session question into a next-question override', () => {
    const event = withRealtimeSessionInstructions(
      {
        type: 'response.create',
        response: {
          instructions: 'Текущий вопрос: «Новый вопрос». Озвучь его дословно.',
        },
      },
      [
        'Ты голосовой интервьюер. Никогда не отвечай вместо кандидата.',
        'Текущий вопрос: «Старый вопрос».',
      ].join('\n')
    );

    const instructions = (event.response as { instructions: string })
      .instructions;
    expect(instructions).toContain('Новый вопрос');
    expect(instructions).not.toContain('Старый вопрос');
  });
});
