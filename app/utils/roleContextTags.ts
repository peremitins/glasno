// Подсказки-теги «Уточнить контекст» под выбранную роль. Отдаём стек/контекст,
// который реально меняет вопросы. Матчим по ключевым словам роли (кириллица и
// латиница), первое совпадение выигрывает — поэтому специфичное выше общего.

interface ContextRule {
  match: string[];
  tags: string[];
}

const RULES: ContextRule[] = [
  // IT — направления разработки
  { match: ['frontend', 'фронтенд', 'фронт', 'верстальщик'], tags: ['Vue', 'React', 'Angular', 'TypeScript', 'Тимлид', 'Highload'] },
  { match: ['fullstack', 'фулстек', 'фуллстек'], tags: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Стартап'] },
  { match: ['backend', 'бэкенд', 'бэк', 'серверный'], tags: ['Python', 'Java', 'Go', 'Node.js', 'PostgreSQL', 'Микросервисы'] },
  { match: ['ios', 'swift', 'айос'], tags: ['Swift', 'SwiftUI', 'UIKit', 'Objective-C'] },
  { match: ['android', 'kotlin', 'андроид'], tags: ['Kotlin', 'Java', 'Jetpack Compose'] },
  { match: ['мобильн', 'mobile', 'мобайл'], tags: ['iOS', 'Android', 'Flutter', 'React Native'] },
  { match: ['игр', 'game', 'gamedev', 'геймдев'], tags: ['Unity', 'Unreal', 'C++', 'C#'] },
  { match: ['1с', '1c', 'одинэс'], tags: ['1С', 'Первичка', 'Бухучёт', 'Доработки'] },
  { match: ['embedded', 'встраиваем', 'микроконтроллер', 'iot'], tags: ['C', 'C++', 'RTOS', 'Микроконтроллеры'] },
  // IT — тестирование
  { match: ['aqa', 'автоматизатор', 'sdet'], tags: ['Selenium', 'Playwright', 'API-тесты', 'Python', 'CI/CD'] },
  { match: ['qa', 'тестировщик', 'тестирован', 'tester'], tags: ['Ручное тестирование', 'API-тесты', 'Postman', 'Тест-кейсы'] },
  // IT — инфраструктура
  { match: ['devops', 'девопс'], tags: ['Kubernetes', 'Docker', 'CI/CD', 'AWS', 'Terraform'] },
  { match: ['sre', 'надёжност'], tags: ['Kubernetes', 'Мониторинг', 'SLA/SLO', 'Инциденты'] },
  { match: ['систем', 'sysadmin', 'админ'], tags: ['Linux', 'Windows Server', 'Сети', 'Bash'] },
  { match: ['сетев', 'network', 'cisco'], tags: ['Cisco', 'BGP', 'VPN', 'TCP/IP'] },
  { match: ['безопасн', 'security', 'пентест', 'infosec'], tags: ['Пентест', 'OWASP', 'Сети', 'SIEM'] },
  // IT — данные и аналитика
  { match: ['data scientist', 'сайентист', 'машинн', 'ml', 'нейросет'], tags: ['Python', 'ML', 'NLP', 'CV', 'A/B-тесты'] },
  { match: ['prompt engineer', 'prompt-инженер', 'ai-инженер', 'ai engineer', 'llm engineer', 'промпт-инженер'], tags: ['LLM', 'Промпт-инжиниринг', 'Python', 'RAG', 'AI-агенты'] },
  { match: ['data engineer', 'дата-инженер', 'etl', 'dwh'], tags: ['ETL', 'Spark', 'Airflow', 'SQL', 'DWH'] },
  { match: ['аналитик данных', 'data analyst', 'bi'], tags: ['SQL', 'Power BI', 'Дашборды', 'A/B-тесты'] },
  { match: ['системный аналит', 'system analyst'], tags: ['BPMN', 'API', 'SQL', 'ТЗ', 'Интеграции'] },
  { match: ['бизнес-аналит', 'business analyst'], tags: ['BPMN', 'Требования', 'Стейкхолдеры', 'ТЗ'] },
  { match: ['продуктовый аналит', 'product analyst'], tags: ['SQL', 'Метрики', 'A/B-тесты', 'Когорты'] },
  // IT — продукт/проект/дизайн/менеджмент
  { match: ['продакт', 'product manager', 'product owner', 'менеджер продукта', 'продукт-менеджер', 'владелец продукта'], tags: ['Метрики', 'Roadmap', 'Discovery', 'A/B-тесты', 'Юнит-экономика'] },
  { match: ['проджект', 'project manager', 'проектный менеджер', 'руководитель проект'], tags: ['Сроки', 'Риски', 'Agile', 'Стейкхолдеры'] },
  { match: ['scrum', 'agile', 'скрам', 'аджайл'], tags: ['Scrum', 'Kanban', 'Фасилитация', 'Метрики команды'] },
  { match: ['ux-исследовател', 'user research', 'ux researcher', 'юзабилити'], tags: ['Исследования', 'Юзабилити-тесты', 'Интервью с пользователями', 'Опросы', 'Прототипы'] },
  { match: ['ux', 'ui', 'дизайн', 'designer', 'figma'], tags: ['Исследования', 'Прототипы', 'Дизайн-система', 'Figma'] },
  { match: ['техническ', 'technical writer', 'техписат', 'документац'], tags: ['Документация', 'API', 'Markdown'] },
  { match: ['архитектор', 'architect'], tags: ['Микросервисы', 'Highload', 'Паттерны', 'Облако'] },
  { match: ['тимлид', 'team lead', 'teamlead', 'руководитель группы разработ', 'cto', 'технический директор'], tags: ['Управление командой', '1:1', 'Найм', 'Highload'] },
  { match: ['devrel', 'developer relations', 'developer advocate', 'деврел'], tags: ['Комьюнити', 'Конференции', 'Техконтент', 'Open Source'] },
  { match: ['customer success', 'csm'], tags: ['SaaS', 'Онбординг клиентов', 'Retention', 'CRM', 'B2B'] },
  { match: ['поддержк', 'support', 'helpdesk'], tags: ['Пользователи', 'SLA', 'Тикеты', 'Эскалации'] },
  { match: ['программист', 'разработчик', 'developer'], tags: ['Frontend', 'Backend', 'Mobile', 'Алгоритмы'] },
  // Не-IT
  { match: ['продаж', 'sales', 'клиент'], tags: ['B2B', 'B2C', 'Холодные звонки', 'CRM', 'Переговоры'] },
  { match: ['growth', 'перформанс-маркетолог', 'performance-маркетолог', 'growth-маркетолог'], tags: ['Воронки', 'A/B-тесты', 'Юнит-экономика', 'Ретеншн', 'Пейд-трафик'] },
  { match: ['маркет', 'marketing', 'smm', 'pr'], tags: ['Performance', 'SMM', 'Аналитика', 'Контент', 'SEO'] },
  { match: ['бухгалтер', 'финанс', 'экономист', 'аудит', 'казначей'], tags: ['1С', 'Первичка', 'Налоги', 'НДС', 'Отчётность'] },
  { match: ['hrbp', 'hr business partner', 'hr-бизнес-партнёр'], tags: ['Оргдизайн', 'Вовлечённость', 'Бизнес-партнёрство', 'KPI', 'Change Management'] },
  { match: ['it-рекрутер', 'tech recruiter', 'айти-рекрутер', 'технический рекрутер'], tags: ['Сорсинг', 'Технический стек', 'HH.ru', 'Воронка найма', 'Собеседования'] },
  { match: ['персонал', 'hr', 'рекрут', 'кадр', 'подбор'], tags: ['Подбор', 'Адаптация', 'Собеседования', 'HR-бренд'] },
  { match: ['юрист', 'юрискон', 'legal', 'комплаенс'], tags: ['Договоры', 'Комплаенс', 'Суды', 'Претензии'] },
  { match: ['логист', 'склад', 'снабжен', 'закуп'], tags: ['Склад', 'Поставки', 'WMS', 'Маршруты'] },
  { match: ['врач', 'медиц', 'фармац', 'сестра'], tags: ['Диагностика', 'Пациенты', 'Протоколы'] },
  { match: ['педагог', 'учитель', 'преподават', 'воспитат', 'репетитор', 'тьютор'], tags: ['Методика', 'Программа', 'Оценивание'] },
];

const GENERIC_TAGS = ['B2B', 'B2C', 'Стартап', 'Крупная компания', 'Удалёнка'];

export function getRoleContextTags(role: string): string[] {
  const normalized = role.trim().toLowerCase();
  if (!normalized) return [];
  for (const rule of RULES) {
    if (rule.match.some((keyword) => normalized.includes(keyword))) {
      return rule.tags;
    }
  }
  return GENERIC_TAGS;
}
