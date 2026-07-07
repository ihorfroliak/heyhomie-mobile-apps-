"""
Generate a sample HeyHomie invoice PDF that mirrors the layout produced by
packages/domain/invoicing.ts -> invoiceHtml(). Data matches demoInvoices[1]
(Fakturownia, Anna K.). Output: HeyHomie_Invoice_FV_2025_05_2.pdf in Downloads.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

INK = colors.HexColor("#14133a")
GREY = colors.HexColor("#727189")
FAINT = colors.HexColor("#9aa0b4")
LINE = colors.HexColor("#e2e2eb")

inv = {
    "company": "HeyHomie",
    "number": "FV/2025/05/2",
    "source": "fakturownia",
    "issueDate": "2025-05-15",
    "dueDate": "2025-06-30",
    "clientName": "Anna K.",
    "net": 300.0,
    "vat": 69.0,
    "gross": 369.0,
    "currency": "PLN",
    "status": "unpaid",
}


def money(n):
    unit = "zł" if inv["currency"] == "PLN" else inv["currency"]
    return f"{n:.2f} {unit}"


out = "C:/Users/ihorf/Downloads/HeyHomie_Invoice_FV_2025_05_2.pdf"
c = canvas.Canvas(out, pagesize=A4)
W, H = A4
x = 32
y = H - 40

# Title
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 20)
c.drawString(x * mm / mm, y, f'{inv["company"]} — invoice {inv["number"]}')

# Subtitle
y -= 22
c.setFillColor(GREY)
c.setFont("Helvetica", 11)
c.drawString(x, y, f'Source: {inv["source"]} · issued {inv["issueDate"]} · due {inv["dueDate"]}')

# Bill to
y -= 34
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 11)
c.drawString(x, y, "Bill to: ")
c.setFont("Helvetica", 11)
c.drawString(x + 48, y, inv["clientName"])

# Table header
y -= 32
col_desc = x
col_net = W - 300
col_vat = W - 190
col_gross = W - 80
row_h = 22

c.setFillColor(INK)
c.rect(x, y - 6, W - 2 * x, row_h, fill=1, stroke=0)
c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 11)
c.drawString(col_desc + 8, y, "Description")
c.drawRightString(col_net, y, "Net")
c.drawRightString(col_vat, y, "VAT")
c.drawRightString(col_gross, y, "Gross")

# Table row
y -= row_h
c.setFillColor(INK)
c.setFont("Helvetica", 11)
c.drawString(col_desc + 8, y, "Cleaning services")
c.drawRightString(col_net, y, money(inv["net"]))
c.drawRightString(col_vat, y, money(inv["vat"]))
c.drawRightString(col_gross, y, money(inv["gross"]))
c.setStrokeColor(LINE)
c.line(x, y - 8, W - x, y - 8)

# Total
y -= 40
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 15)
c.drawRightString(W - x, y, f'Total: {money(inv["gross"])}')

# Footer
y -= 40
c.setFillColor(FAINT)
c.setFont("Helvetica", 9)
c.drawString(
    x, y,
    f'Status: {inv["status"]}. This document mirrors the record from {inv["source"]}; '
    "the legally-issued invoice is the source of truth."
)

c.showPage()
c.save()
print("wrote", out)
