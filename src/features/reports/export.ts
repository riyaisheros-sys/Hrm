import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ReportColumn {
  key: string
  label: string
}

type Row = Record<string, unknown>

/** Optional per-cell background (RGB) so exports keep the on-screen colours. */
export type CellFill = (row: Row, columnKey: string) => [number, number, number] | undefined

/**
 * An additional table exported next to the main one — its own sheet in Excel,
 * its own section in the PDF. Used for one-row-per-entry detail (planning
 * slots, status history) that does not fit in a single cell.
 */
export interface ExtraTable {
  name: string
  columns: ReportColumn[]
  rows: Row[]
}

const text = (value: unknown) => (value == null ? '' : String(value))

/** Column widths from the content: wide enough to read, capped so one long
 *  remark does not stretch the sheet. */
function sheetFrom(columns: ReportColumn[], rows: Row[]) {
  const header = columns.map((c) => c.label)
  const body = rows.map((r) => columns.map((c) => r[c.key] ?? ''))
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  ws['!cols'] = columns.map((c, i) => {
    const longest = body.reduce(
      (max, row) =>
        Math.max(max, ...text(row[i]).split('\n').map((line) => line.length)),
      c.label.length,
    )
    return { wch: Math.min(60, Math.max(10, longest + 2)) }
  })
  if (rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }),
    }
  }
  return ws
}

/** Excel sheet names: max 31 chars, none of \ / ? * [ ] : */
const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)

/** Export rows to an .xlsx file; each extra table becomes its own sheet. */
export function exportExcel(
  filename: string,
  columns: ReportColumn[],
  rows: Row[],
  extra: ExtraTable[] = [],
) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFrom(columns, rows), 'Report')
  for (const table of extra) {
    if (table.rows.length === 0) continue
    XLSX.utils.book_append_sheet(wb, sheetFrom(table.columns, table.rows), sheetName(table.name))
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

const BRAND: [number, number, number] = [79, 70, 229]

/** Export to a landscape .pdf; each extra table follows as its own section. */
export function exportPdf(
  title: string,
  filename: string,
  columns: ReportColumn[],
  rows: Row[],
  cellFill?: CellFill,
  options: { subtitle?: string; extra?: ExtraTable[] } = {},
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFontSize(14)
  doc.text(title, 10, 14)
  doc.setFontSize(8)
  doc.setTextColor(100)
  doc.text(
    [options.subtitle, `${rows.length} record${rows.length === 1 ? '' : 's'}`, `Generated ${new Date().toLocaleString()}`]
      .filter(Boolean)
      .join('   ·   '),
    10,
    19,
  )
  doc.setTextColor(0)

  const table = (cols: ReportColumn[], data: Row[], startY: number, fill?: CellFill) => {
    // Many columns → smaller type so the table still fits the page width.
    const fontSize = cols.length > 16 ? 5.5 : cols.length > 11 ? 6.5 : 7.5
    autoTable(doc, {
      head: [cols.map((c) => c.label)],
      body: data.map((r) => cols.map((c) => text(r[c.key]))),
      startY,
      margin: { left: 10, right: 10, bottom: 12 },
      styles: {
        fontSize,
        cellPadding: 1.4,
        overflow: 'linebreak',
        valign: 'top',
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', valign: 'middle' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      rowPageBreak: 'avoid',
      didParseCell: (cell) => {
        if (!fill || cell.section !== 'body') return
        const colour = fill(data[cell.row.index], cols[cell.column.index].key)
        if (colour) cell.cell.styles.fillColor = colour
      },
    })
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  }

  let y = table(columns, rows, 23, cellFill)

  for (const section of options.extra ?? []) {
    if (section.rows.length === 0) continue
    if (y > pageHeight - 40) {
      doc.addPage()
      y = 10
    }
    doc.setFontSize(11)
    doc.text(section.name, 10, y + 9)
    y = table(section.columns, section.rows, y + 12)
  }

  const pages = doc.getNumberOfPages()
  doc.setFontSize(7)
  doc.setTextColor(120)
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.text(`Page ${page} of ${pages}`, pageWidth - 10, pageHeight - 6, { align: 'right' })
  }
  doc.save(`${filename}.pdf`)
}
