function normalizeVoiceCommand(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”]/g, '')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNextQuestionVoiceCommand(value: string): boolean {
  const command = normalizeVoiceCommand(value);
  if (!command) return false;

  const politePrefix =
    '(?:ну\\s+)?(?:давай(?:те)?\\s+|можем\\s+|можно\\s+|хочу\\s+|пожалуйста\\s+)?';
  const politeSuffix = '(?:\\s+пожалуйста)?';
  const politeInterjection = '(?:\\s+пожалуйста)?';
  const nextQuestion =
    '(?:следующ(?:ий\\s+(?:вопрос|пункт)|ему\\s+(?:вопросу|пункту))|друг(?:ой\\s+вопрос|ому\\s+вопросу))';
  // Распознавание самостоятельной команды допускает все падежные формы:
  // голосовой ввод нередко возвращает «следующему вопросу» или
  // «следующему пункту» без предлога.
  const directQuestion =
    '(?:следующ(?:ий\\s+(?:вопрос|пункт)|его\\s+(?:вопроса|пункта)|ему\\s+(?:вопросу|пункту)|им\\s+(?:вопросом|пунктом)|ем\\s+(?:вопросе|пункте))|друг(?:ой\\s+вопрос|ого\\s+вопроса|ому\\s+вопросу|им\\s+вопросом|ом\\s+вопросе))';
  const replaceQuestion =
    '(?:поменяй|поменять|смени|сменить|замени|заменить|задай)\\s+(?:другой\\s+)?вопрос';

  return (
    new RegExp(`^${politePrefix}${directQuestion}${politeSuffix}$`, 'iu').test(
      command
    ) ||
    new RegExp(`^${politePrefix}к\\s+${nextQuestion}$`, 'iu').test(command) ||
    new RegExp(
      `^${politePrefix}(?:перейди|переходи|перейдем|перейдемте|перейти|переходим|переключи|переключиться|переключаемся)${politeInterjection}\\s+(?:к|ко|на)\\s+${nextQuestion}$`,
      'iu'
    ).test(command) ||
    new RegExp(`^${politePrefix}${replaceQuestion}${politeSuffix}$`, 'iu').test(
      command
    )
  );
}

export function isNextQuestionTransitionReply(value: string): boolean {
  if (/[?？]/u.test(value)) return false;

  const command = normalizeVoiceCommand(value);
  if (!command || /^(?:если|когда)\b/iu.test(command)) return false;

  const acknowledgementPrefix =
    '(?:(?:понял|поняла|понял[аи]?|принял|приняла|понимаю|хорошо|окей|ок|отлично|да|конечно|ладно|без\\s+проблем|сейчас|принято|молчу|молчим|договорились|тогда)\\s+)*';
  const optionalLets = '(?:давай(?:те)?\\s+)?';
  const transitionVerb =
    '(?:переходим|перейдем|перехожу|перейду|переключаюсь|переключимся|переключаемся|идем|жду|ждем|ждемте|ожидаю|ожидаем)';
  const transitionTarget =
    '(?:(?:к|ко)\\s+следующему\\s+вопросу|на\\s+следующий\\s+вопрос|следующ(?:ий|его)\\s+вопрос(?:а)?|(?:к|ко)\\s+другому\\s+вопросу|на\\s+другой\\s+вопрос|друго(?:й|го)\\s+вопрос(?:а)?|дальше)';
  const newQuestion =
    '(?:задаю|задам|дам|даю|перехожу\\s+к)\\s+(?:друг(?:ой|ому)|следующ(?:ий|ему))\\s+вопрос(?:у)?';

  return (
    new RegExp(
      `^${acknowledgementPrefix}${optionalLets}${transitionVerb}\\s+${transitionTarget}$`,
      'iu'
    ).test(command) ||
    new RegExp(`^${acknowledgementPrefix}${newQuestion}$`, 'iu').test(command)
  );
}
