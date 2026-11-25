import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SalaryRun } from './hooks'

/** Whole rupees with Indian grouping — the same rule as the screens. */
const inr = (value: unknown) =>
  `Rs. ${Math.round(Number(value ?? 0) || 0).toLocaleString('en-IN')}`
const num = (value: unknown) => Number(value ?? 0) || 0

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const monthName = (periodMonth: string) => {
  const [y, m] = periodMonth.slice(0, 7).split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await fetch(url).then((r) => r.blob())
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null // a blocked logo never stops the download
  }
}

/**
 * A structured salary slip: employee, paid days, earnings, deductions, net,
 * and how the base was worked out. Uses the payslip template's letterhead,
 * logo and footer when one is given.
 */
export async function downloadPayslip(input: {
  run: SalaryRun
  employee: { name: string; code?: string | null; email?: string | null }
  template?: { letterhead?: string | null; logo_url?: string | null; footer?: string | null } | null
}) {
  const { run, employee, template } = input
  const b = (run.breakdown ?? {}) as Record<string, unknown>
  const month = monthName(String(run.period_month))
  const doc = new jsPDF()
  const brand: [number, number, number] = [67, 56, 202]

  let y = 16
  if (template?.logo_url) {
    const logo = await toDataUrl(template.logo_url)
    if (logo) {
      doc.addImage(logo, 14, 10, 28, 18)
      y = 34
    }
  }
  if (template?.letterhead) {
    doc.setFontSize(10)
    doc.setTextColor(80)
    doc.text(template.letterhead, 196, 16, { align: 'right' })
  }
  doc.setTextColor(20)
  doc.setFontSize(16)
  doc.text(`Salary Slip - ${month}`, 14, y)
  y += 4

  autoTable(doc, {
    startY: y + 2,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { textColor: 110, cellWidth: 40 }, 2: { textColor: 110, cellWidth: 40 } },
    body: [
      ['Employee', employee.name, 'Pay period', month],
      ['Employee code', employee.code || '—', 'Status', String(run.status ?? 'finalized')],
    ],
  })

  const paidDays = [
    ['Present days', String(num(run.present_days))],
    ['Half days', String(num(run.half_days))],
    ['Quarter days', String(num(run.quarter_days))],
    ['Paid leave', String(num(run.paid_leave_days))],
    ['Sundays paid', String(num(b.sundays))],
    ['Holidays paid', String(num(b.holidays))],
    ['Absent days', String(num(run.absent_days))],
    ['Total paid days', String(num(b.paidUnits))],
  ]
  const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  autoTable(doc, {
    startY: after + 6,
    head: [['Attendance', 'Days']],
    body: paidDays,
    headStyles: { fillColor: brand },
    styles: { fontSize: 9.5 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 110 },
  })
  const leftEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const earnings = [
    ['Base earned', inr(run.base_earned)],
    ['Overtime', inr(run.overtime_pay)],
    ['Incentives', inr(run.incentives)],
    ['Increments', inr(run.increments)],
  ]
  const deductions = [
    ['Penalties', inr(run.penalties)],
    ['PF', inr(run.pf)],
    ['ESIC', inr(run.esic)],
    ['Professional tax', inr(run.professional_tax)],
    ['TDS', inr(run.tds)],
  ]
  autoTable(doc, {
    startY: after + 6,
    head: [['Earnings', 'Amount']],
    body: [...earnings, [{ content: 'Gross', styles: { fontStyle: 'bold' } }, { content: inr(run.gross), styles: { fontStyle: 'bold' } }]],
    headStyles: { fillColor: [5, 150, 105] },
    styles: { fontSize: 9.5 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 106, right: 14 },
  })
  const earnEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  autoTable(doc, {
    startY: earnEnd + 4,
    head: [['Deductions', 'Amount']],
    body: deductions,
    headStyles: { fillColor: [220, 38, 38] },
    styles: { fontSize: 9.5 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 106, right: 14 },
  })
  const dedEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  let yNet = Math.max(leftEnd, dedEnd) + 10
  doc.setFillColor(236, 253, 245)
  doc.roundedRect(14, yNet - 6, 182, 12, 2, 2, 'F')
  doc.setFontSize(12)
  doc.setTextColor(6, 95, 70)
  doc.text('Net pay', 18, yNet + 1.5)
  doc.text(inr(run.net), 192, yNet + 1.5, { align: 'right' })
  doc.setTextColor(60)

  yNet += 14
  if (num(b.version) >= 2) {
    doc.setFontSize(9)
    const basis =
      b.dayBasis === 'calendar'
        ? `Per day = monthly salary ${inr(b.monthlyCtc)} ÷ ${num(b.divisor)} calendar days = ${inr(b.perDay)}.`
        : `Per day = monthly salary ${inr(b.monthlyCtc)} ÷ ${num(b.divisor)} working days = ${inr(b.perDay)}.`
    const lines = [
      'How the base was calculated',
      basis,
      `Paid days = present + half days × ${num(b.halfFactor)} + quarter days × ${num(b.quarterFactor)} + paid leave + Sundays + holidays = ${num(b.paidUnits)}.`,
      `Base earned = ${inr(b.monthlyCtc)} × ${num(b.paidUnits)} ÷ ${num(b.divisor)} = ${inr(run.base_earned)}.`,
    ]
    doc.setFont('helvetica', 'bold')
    doc.text(lines[0], 14, yNet)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(lines.slice(1).join(' '), 182) as string[], 14, yNet + 5)
  }

  if (template?.footer) {
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(template.footer, 105, 285, { align: 'center' })
  }
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text('This is a system-generated salary slip.', 105, 290, { align: 'center' })
  doc.save(`salary-slip-${String(run.period_month).slice(0, 7)}.pdf`)
}
