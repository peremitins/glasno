import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { InterviewReport, InterviewTrainingMode } from '@/shared/dto';

export const REPORT_PDF_MODEL_ANSWER_LABEL = 'Вариант сильного ответа';
export const REPORT_PDF_STAR_LABEL =
  'Как усилить ответ (STAR: ситуация, задача, действие, результат)';
export const REPORT_PDF_INTERVIEWER_MODEL_ANSWER_LABEL =
  'Как можно было спросить сильнее';
export const REPORT_PDF_INTERVIEWER_STAR_LABEL = 'Как усилить следующий вопрос';
const REPORT_PDF_STAR_EXPLANATION =
  'STAR (ситуация, задача, действие, результат)';

// Шрифт лежит в репозитории: встроенные шрифты pdfkit (Helvetica) не содержат
// кириллицы, а системных TTF в рантайм-образе (node:alpine) нет вовсе.
const FONT_ASSET_KEY = 'fonts/Onest-Variable.ttf';
const FONT_DISK_CANDIDATES = [
  join(process.cwd(), 'server/assets', FONT_ASSET_KEY),
  join(process.cwd(), '.output/server/assets', FONT_ASSET_KEY),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
];

let cachedFont: Buffer | undefined;

async function loadReportFont(): Promise<Buffer> {
  if (cachedFont) {
    return cachedFont;
  }

  const fromAssets = await loadFontFromServerAssets();
  if (fromAssets) {
    cachedFont = fromAssets;
    return cachedFont;
  }

  const diskPath = FONT_DISK_CANDIDATES.find((candidate) =>
    existsSync(candidate)
  );
  if (!diskPath) {
    throw new Error(
      `Не найден шрифт для PDF-отчёта (${FONT_ASSET_KEY}): PDF без него получится нечитаемым`
    );
  }

  cachedFont = await readFile(diskPath);
  return cachedFont;
}

async function loadFontFromServerAssets(): Promise<Buffer | null> {
  const storage = (
    globalThis as {
      useStorage?: (base: string) => {
        getItemRaw: (key: string) => Promise<unknown>;
      };
    }
  ).useStorage;
  if (typeof storage !== 'function') {
    return null;
  }

  try {
    const raw = await storage('assets:server').getItemRaw(FONT_ASSET_KEY);
    if (!raw) {
      return null;
    }
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
  } catch {
    return null;
  }
}

export async function renderReportPdf(
  report: InterviewReport
): Promise<Buffer> {
  const font = await loadReportFont();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4' });

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.registerFont('GlasnoSans', font);
    doc.font('GlasnoSans');

    const labels = reportPdfLabels(report.trainingMode);

    doc.fontSize(22).text(labels.title);
    doc.moveDown(0.7);
    doc.fontSize(12).fillColor('#555').text(`Отчёт: ${report.id}`);
    doc.fillColor('#000').moveDown();

    if (report.status !== 'done') {
      doc.fontSize(14).text(`Статус отчёта: ${report.status}`);
      if (report.errorMessage) {
        doc.moveDown().text(`Ошибка: ${report.errorMessage}`);
      }
      doc.end();
      return;
    }

    doc.fontSize(18).text(`Итоговый балл: ${report.overallScore ?? '—'} / 100`);
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .text(formatReportPdfText(report.verdict || 'Вердикт не сформирован'));
    doc.moveDown();
    doc.fontSize(12).text(formatReportPdfText(report.summary || ''));
    doc.moveDown();

    if (report.criteria) {
      doc.fontSize(15).text('Критерии');
      doc.moveDown(0.4);
      for (const [key, value] of Object.entries(report.criteria)) {
        doc
          .fontSize(11)
          .text(`${criteriaLabel(key, report.trainingMode)}: ${value}/100`);
      }
      doc.moveDown();
    }

    const fixes = report.recommendations?.topFixes ?? [];
    if (fixes.length) {
      doc.fontSize(15).text('Главные правки');
      doc.moveDown(0.4);
      fixes.forEach((fix, index) => {
        doc.fontSize(11).text(`${index + 1}. ${formatReportPdfText(fix)}`);
      });
      doc.moveDown();
    }

    if (report.questionAnalysis?.length) {
      doc.fontSize(15).text(labels.analysisSection);
      doc.moveDown(0.4);
      for (const item of report.questionAnalysis) {
        doc.fontSize(12).text(formatReportPdfText(item.question), {
          underline: true,
        });
        doc
          .fontSize(9)
          .fillColor('#555')
          .text(reportQuestionKindLabel(item.kind));
        doc.fillColor('#000');
        doc
          .fontSize(10)
          .text(`${labels.answer}: ${formatReportPdfText(item.answer)}`);
        if (item.criteria) {
          doc.text('Оценки по вопросу');
          for (const [key, value] of Object.entries(item.criteria)) {
            doc.text(
              `${criteriaLabel(key, report.trainingMode)}: ${value}/100`
            );
          }
        }
        doc.text(`Что хорошо: ${formatReportPdfText(item.whatWorked)}`);
        doc.text(`Что слабо: ${formatReportPdfText(item.whatWeak)}`);
        if (item.modelAnswer) {
          doc.text(
            `${labels.modelAnswer}: ${formatReportPdfText(item.modelAnswer)}`
          );
        }
        doc.text(
          `${labels.strongerStar}: ${formatReportPdfText(
            item.strongerAnswerStar
          )}`
        );
        doc.text(`Мини-тренировка: ${formatReportPdfText(item.nextPractice)}`);
        doc.moveDown();
      }
    }

    doc.end();
  });
}

export function formatReportPdfText(value: string): string {
  return value.replace(
    /\bSTAR\b(?!\s*\(ситуация, задача, действие, результат\))/gi,
    REPORT_PDF_STAR_EXPLANATION
  );
}

export function reportPdfCriteriaLabel(key: string): string {
  return reportPdfCriteriaLabelForMode(key, 'candidate');
}

export function reportPdfCriteriaLabelForMode(
  key: string,
  trainingMode: InterviewTrainingMode
): string {
  const candidateLabels: Record<string, string> = {
    substance: 'Суть ответа',
    structure: 'Структура',
    delivery: 'Подача',
  };
  const interviewerLabels: Record<string, string> = {
    substance: 'Качество проверки',
    structure: 'Структура интервью',
    delivery: 'Подача',
  };
  const labels =
    trainingMode === 'interviewer' ? interviewerLabels : candidateLabels;
  return labels[key] || key;
}

function criteriaLabel(
  key: string,
  trainingMode: InterviewTrainingMode
): string {
  return reportPdfCriteriaLabelForMode(key, trainingMode);
}

function reportPdfLabels(trainingMode: InterviewTrainingMode) {
  if (trainingMode === 'interviewer') {
    return {
      title: 'Гласно — отчёт по интервьюеру',
      analysisSection: 'Разбор ведения интервью',
      answer: 'Фрагмент разговора',
      modelAnswer: REPORT_PDF_INTERVIEWER_MODEL_ANSWER_LABEL,
      strongerStar: REPORT_PDF_INTERVIEWER_STAR_LABEL,
    };
  }

  return {
    title: 'Гласно — отчёт по интервью',
    analysisSection: 'Разбор по вопросам',
    answer: 'Ответ',
    modelAnswer: REPORT_PDF_MODEL_ANSWER_LABEL,
    strongerStar: REPORT_PDF_STAR_LABEL,
  };
}

function reportQuestionKindLabel(kind: string): string {
  return kind === 'clarification' ? 'Уточнение' : 'Основной вопрос';
}
