import { createReportService } from '@/server/application/reports/serviceFactory';
import { renderReportPdf } from '@/server/infrastructure/pdf/reportPdf';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw apiError('E_VALIDATION', 'Не указан id отчёта');
  }

  const service = createReportService(event);
  const report = await service.getById({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    reportId: id,
  });

  if (report.status !== 'done') {
    throw apiError('E_CONFLICT', 'PDF доступен только для готового отчёта');
  }

  const pdf = await renderReportPdf(report);
  setResponseHeader(event, 'Content-Type', 'application/pdf');
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="glasno-report-${report.id}.pdf"`
  );
  return pdf;
});
