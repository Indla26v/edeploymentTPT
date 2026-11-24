import "server-only";

import ExcelJS from "exceljs";

export type SheetColumn<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined; width?: number };

/** Builds a single-sheet .xlsx with a bold, frozen header row. */
export async function buildWorkbook<T>(sheetName: string, columns: SheetColumn<T>[], rows: T[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "eDeployment";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(columns.map((c) => c.value(r) ?? ""));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Reads the first sheet into objects keyed by the header row (trimmed). Empty rows are skipped. */
export async function readWorkbook(data: ArrayBuffer): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.text ?? "").trim()));
  const out: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Record<string, string> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = headers[col];
      if (!h) return;
      const v = String(cell.text ?? "").trim();
      if (v) any = true;
      obj[h] = v;
    });
    if (any) out.push(obj);
  });
  return out;
}
