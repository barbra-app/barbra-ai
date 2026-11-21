import ExcelJS from "exceljs";
import type { Concert, ConcertManualSource, ConcertSegmentBreakdown, ConcertSummary } from "@/lib/domain/analytics";
import { DEMOGRAPHICS_SOURCES, DEVICE_GEO_SOURCES, PLATFORM_BREAKDOWN_SOURCES, sourceLabel } from "@/lib/analytics/source-labels";

const INT_FORMAT = "#,##0";
const PERCENT_FORMAT = "0.00%";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F1" } };
const HEADER_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FFC9C9C9" } } };

function sanitizeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "").trim();
}

function addNote(sheet: ExcelJS.Worksheet, text: string, columnCount: number) {
  const row = sheet.addRow([text]);
  if (columnCount > 1) sheet.mergeCells(row.number, 1, row.number, columnCount);
  row.font = { italic: true, size: 10, color: { argb: "FF737373" } };
  sheet.addRow([]);
}

function addHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = HEADER_BORDER;
  });
  sheet.views = [{ state: "frozen", ySplit: row.number }];
}

function setColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

// Applies a number format to every data cell in a column (everything below
// the header row), so counts/percents render as actual Excel numbers —
// right-aligned, thousands-separated, sortable — instead of plain text.
function formatColumn(sheet: ExcelJS.Worksheet, headerRowNumber: number, columnIndex: number, numFmt: string) {
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getCell(rowNumber, columnIndex).numFmt = numFmt;
  }
}

function appendBreakdownSheet(workbook: ExcelJS.Workbook, sheetName: string, columnLabel: string, rows: ConcertSegmentBreakdown[], sources: string[]) {
  if (rows.length === 0) return;
  const hasSource = rows.some((row) => row.source);
  const headers = [columnLabel, ...(hasSource ? ["Red"] : []), "Impresiones", "Clics", "Conversiones", "Gasto"];
  const sheet = workbook.addWorksheet(sheetName);
  addNote(sheet, `Incluye datos de: ${sources.map(sourceLabel).join(", ")}`, headers.length);
  const headerRowNumber = sheet.rowCount + 1;
  addHeaderRow(sheet, headers);
  for (const row of rows) {
    sheet.addRow([row.label, ...(hasSource ? [row.source ? sourceLabel(row.source) : ""] : []), row.impressions, row.clicks, row.conversions, row.billedSpend]);
  }
  const firstMetricColumn = hasSource ? 3 : 2;
  for (let column = firstMetricColumn; column < firstMetricColumn + 4; column += 1) formatColumn(sheet, headerRowNumber, column, INT_FORMAT);
  setColumnWidths(sheet, [28, ...(hasSource ? [16] : []), 14, 12, 14, 16]);
}

export async function downloadConcertWorkbook(
  concert: Concert,
  summary: ConcertSummary,
  manualSources: ConcertManualSource[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Barbra Intelligence";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Resumen");
  addHeaderRow(summarySheet, ["Métrica", "Valor"]);
  summarySheet.addRow(["Impresiones", summary.total.impressions]).getCell(2).numFmt = INT_FORMAT;
  summarySheet.addRow(["Clics", summary.total.clicks]).getCell(2).numFmt = INT_FORMAT;
  summarySheet.addRow(["Conversiones", summary.total.conversions]).getCell(2).numFmt = INT_FORMAT;
  summarySheet.addRow(["CTR", summary.total.ctr]).getCell(2).numFmt = PERCENT_FORMAT;
  summarySheet.addRow(["Gasto", summary.total.billedSpend]).getCell(2).numFmt = INT_FORMAT;
  if (manualSources.length > 0) {
    summarySheet.addRow([]);
    addNote(summarySheet, 'Incluye las fuentes manuales (ver hoja "Fuentes manuales")', 2);
  }
  setColumnWidths(summarySheet, [20, 18]);

  const platformSheet = workbook.addWorksheet("Por plataforma");
  const platformHeaders = ["Plataforma", "Campaña", "Impresiones", "Clics", "Conversiones", "CTR", "Gasto"];
  addHeaderRow(platformSheet, platformHeaders);
  const platformHeaderRow = 1;
  for (const platform of summary.byPlatform) {
    platformSheet.addRow([sourceLabel(platform.source), "", platform.impressions, platform.clicks, platform.conversions, platform.ctr, platform.billedSpend]);
    for (const campaign of platform.campaigns) {
      platformSheet.addRow([sourceLabel(platform.source), campaign.campaignName, campaign.impressions, campaign.clicks, campaign.conversions, campaign.ctr, campaign.billedSpend]);
    }
  }
  for (const source of manualSources) {
    platformSheet.addRow([`Manual · ${source.platform}`, "", source.impressions ?? "", source.clicks ?? "", source.conversions ?? "", source.ctr ?? "", source.billedSpend ?? ""]);
  }
  formatColumn(platformSheet, platformHeaderRow, 3, INT_FORMAT);
  formatColumn(platformSheet, platformHeaderRow, 4, INT_FORMAT);
  formatColumn(platformSheet, platformHeaderRow, 5, INT_FORMAT);
  formatColumn(platformSheet, platformHeaderRow, 6, PERCENT_FORMAT);
  formatColumn(platformSheet, platformHeaderRow, 7, INT_FORMAT);
  setColumnWidths(platformSheet, [20, 32, 14, 12, 14, 10, 16]);

  if (manualSources.length > 0) {
    const manualSheet = workbook.addWorksheet("Fuentes manuales");
    const manualHeaders = ["Plataforma", "Activa", "Impresiones", "Clics", "Conversiones", "CTR", "Gasto", "Fecha inicio", "Fecha fin", "Notas"];
    addHeaderRow(manualSheet, manualHeaders);
    const manualHeaderRow = 1;
    for (const source of manualSources) {
      manualSheet.addRow([
        source.platform,
        source.active ? "Sí" : "No",
        source.impressions ?? "",
        source.clicks ?? "",
        source.conversions ?? "",
        source.ctr ?? "",
        source.billedSpend ?? "",
        source.startDate ?? "",
        source.endDate ?? "",
        source.notes,
      ]);
    }
    formatColumn(manualSheet, manualHeaderRow, 3, INT_FORMAT);
    formatColumn(manualSheet, manualHeaderRow, 4, INT_FORMAT);
    formatColumn(manualSheet, manualHeaderRow, 5, INT_FORMAT);
    formatColumn(manualSheet, manualHeaderRow, 6, PERCENT_FORMAT);
    formatColumn(manualSheet, manualHeaderRow, 7, INT_FORMAT);
    setColumnWidths(manualSheet, [18, 10, 14, 12, 14, 10, 16, 14, 14, 36]);
  }

  appendBreakdownSheet(workbook, "Dispositivo", "Dispositivo", summary.deviceBreakdown, DEVICE_GEO_SOURCES);
  appendBreakdownSheet(workbook, "Región", "Región", summary.geoBreakdown, DEVICE_GEO_SOURCES);
  appendBreakdownSheet(workbook, "Edad", "Edad", summary.ageBreakdown, DEMOGRAPHICS_SOURCES);
  appendBreakdownSheet(workbook, "Sexo", "Sexo", summary.genderBreakdown, DEMOGRAPHICS_SOURCES);
  appendBreakdownSheet(workbook, "Flujo por red", "Red", summary.publisherPlatformBreakdown, PLATFORM_BREAKDOWN_SOURCES);

  if (summary.trend.length > 0) {
    const trendSheet = workbook.addWorksheet("Tendencia");
    addHeaderRow(trendSheet, ["Fecha", "Gasto", "Conversiones"]);
    const trendHeaderRow = 1;
    for (const point of summary.trend) {
      trendSheet.addRow([point.date, point.billedSpend, point.conversions]);
    }
    formatColumn(trendSheet, trendHeaderRow, 2, INT_FORMAT);
    formatColumn(trendSheet, trendHeaderRow, 3, INT_FORMAT);
    setColumnWidths(trendSheet, [14, 16, 14]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFileNamePart(concert.displayName) || "evento"}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
