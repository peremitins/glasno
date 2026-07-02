import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { InterviewReport } from '@/shared/dto';

export const REPORT_PDF_MODEL_ANSWER_LABEL = 'Вариант сильного ответа';
export const REPORT_PDF_STAR_LABEL =
  'Как усилить ответ (STAR: ситуация, задача, действие, результат)';
const REPORT_PDF_STAR_EXPLANATION =
  'STAR (ситуация, задача, действие, результат)';

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

export async function renderReportPdf(report: InterviewReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 48, size: 'A4' });

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const fontPath = FONT_CANDIDATES.find((candidate) => existsSync(candidate));
    if (fontPath) {
      doc.registerFont('JobAISans', fontPath);
      doc.font('JobAISans');
    }

    doc.fontSize(22).text('JobAI — отчёт по интервью');
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
        doc.fontSize(11).text(`${criteriaLabel(key)}: ${value}/100`);
      }
      doc.moveDown();
    }

    const fixes = report.recommendations?.topFixes ?? [];
    if (fixes.length) {
      doc.fontSize(15).text('3 главные правки');
      doc.moveDown(0.4);
      fixes.forEach((fix, index) => {
        doc.fontSize(11).text(`${index + 1}. ${formatReportPdfText(fix)}`);
      });
      doc.moveDown();
    }

    if (report.questionAnalysis?.length) {
      doc.fontSize(15).text('Разбор по вопросам');
      doc.moveDown(0.4);
      for (const item of report.questionAnalysis) {
        doc.fontSize(12).text(formatReportPdfText(item.question), {
          underline: true,
        });
        doc.fontSize(10).text(`Ответ: ${formatReportPdfText(item.answer)}`);
        doc.text(`Что хорошо: ${formatReportPdfText(item.whatWorked)}`);
        doc.text(`Что слабо: ${formatReportPdfText(item.whatWeak)}`);
        if (item.modelAnswer) {
          doc.text(
            `${REPORT_PDF_MODEL_ANSWER_LABEL}: ${formatReportPdfText(
              item.modelAnswer
            )}`
          );
        }
        doc.text(
          `${REPORT_PDF_STAR_LABEL}: ${formatReportPdfText(
            item.strongerAnswerStar
          )}`
        );
        doc.text(
          `Мини-тренировка: ${formatReportPdfText(item.nextPractice)}`
        );
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
  const labels: Record<string, string> = {
    structure: 'Структура',
    specificity: 'Конкретика',
    relevance: 'Релевантность',
    confidence: 'Уверенность',
    riskPhrases: 'Риск-фразы',
    brevity: 'Краткость и ясность',
  };
  return labels[key] || key;
}

function criteriaLabel(key: string): string {
  return reportPdfCriteriaLabel(key);
}
