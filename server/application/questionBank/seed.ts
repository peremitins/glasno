import type { QuestionBankItem } from '@/shared/dto';

const NOW = '2026-06-28T00:00:00.000Z';

export const QUESTION_BANK_SEED: QuestionBankItem[] = [
  {
    id: 'seed_product_manager_priorities',
    slug: 'product-manager-priorities',
    domain: 'product',
    domainLabel: 'Product',
    role: 'Product Manager',
    type: 'professional',
    typeLabel: 'Профессиональный',
    difficulty: 'middle',
    question: 'Как вы определяете приоритеты в продуктовой roadmap, когда ресурсов не хватает на все инициативы?',
    strongAnswer:
      'Я начинаю с цели квартала и метрики, затем сравниваю инициативы по влиянию, уверенности, стоимости и риску. Финальное решение фиксирую письменно, чтобы команда понимала, что мы сознательно не делаем.',
    commonMistakes:
      'Говорить только про интуицию, не упоминать метрики, не показывать работу с конфликтом стейкхолдеров.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'seed_product_manager_conflict',
    slug: 'product-manager-stakeholder-conflict',
    domain: 'product',
    domainLabel: 'Product',
    role: 'Product Manager',
    type: 'behavioral',
    typeLabel: 'Поведенческий',
    difficulty: 'senior',
    question: 'Расскажите о ситуации, когда вы не согласились с сильным стейкхолдером по продуктовой задаче.',
    strongAnswer:
      'Сильный ответ показывает контекст, риск для бизнеса, данные, вариант компромисса и итоговое решение. Важно объяснить не только победу в споре, но и сохранение рабочих отношений.',
    commonMistakes:
      'Описывать конфликт как личную борьбу, не показывать данные и не называть результат.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'seed_sales_b2b_discovery',
    slug: 'b2b-sales-discovery',
    domain: 'sales',
    domainLabel: 'Продажи',
    role: 'B2B Sales Manager',
    type: 'professional',
    typeLabel: 'Профессиональный',
    difficulty: 'middle',
    question: 'Как вы проводите discovery с новым B2B-клиентом перед коммерческим предложением?',
    strongAnswer:
      'Я уточняю бизнес-цель, текущий процесс, критерии выбора, бюджет, сроки и участников решения. После встречи резюмирую боль, ценность и следующий шаг письмом.',
    commonMistakes:
      'Сразу презентовать продукт, не выявив критерии покупки и реальный процесс принятия решения.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'seed_frontend_performance',
    slug: 'frontend-performance-debugging',
    domain: 'engineering',
    domainLabel: 'Разработка',
    role: 'Frontend Engineer',
    type: 'professional',
    typeLabel: 'Профессиональный',
    difficulty: 'middle',
    question: 'Пользователи жалуются, что страница стала медленной. Как вы будете искать причину?',
    strongAnswer:
      'Сначала воспроизведу проблему и измерю Web Vitals, network, bundle и main thread. Потом отделю регресс данных от регресса UI, найду узкое место профайлером и проверю фикс на реальном сценарии.',
    commonMistakes:
      'Начинать с переписывания компонента без измерений или говорить только про lazy loading.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'seed_hr_motivation',
    slug: 'hr-motivation-job-change',
    domain: 'career',
    domainLabel: 'Карьера',
    role: null,
    type: 'hr',
    typeLabel: 'HR',
    difficulty: 'junior',
    question: 'Почему вы рассматриваете новую работу именно сейчас?',
    strongAnswer:
      'Хороший ответ спокойно объясняет мотивацию через рост, задачи и среду, не превращая прошлое место в жалобу. Достаточно 2-3 конкретных критерия выбора новой роли.',
    commonMistakes:
      'Критиковать бывшего работодателя, говорить слишком общо или звучать так, будто подходит любая вакансия.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'seed_stress_unknown_task',
    slug: 'stress-unknown-task',
    domain: 'career',
    domainLabel: 'Карьера',
    role: null,
    type: 'stress',
    typeLabel: 'Стресс-вопрос',
    difficulty: 'middle',
    question: 'Что вы сделаете, если получите задачу, в которой ничего не понимаете, а срок уже завтра?',
    strongAnswer:
      'Сильный ответ признаёт неопределённость, показывает декомпозицию, быстрый сбор контекста, коммуникацию риска и минимальный deliverable к сроку.',
    commonMistakes:
      'Обещать просто разобраться ночью или, наоборот, сразу отказываться без плана.',
    isPublic: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

