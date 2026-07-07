import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { financialReportHtml, invoiceHtml, type FinancialReportData, type Invoice } from '@heyhomie/domain';

/**
 * Render a financial report to PDF (expo-print) and open the share sheet so the
 * admin can save / email it. The HTML comes from the shared domain renderer, so
 * the PDF matches the on-screen numbers exactly.
 */
export async function exportFinancialReportPdf(data: FinancialReportData): Promise<string> {
    const html = financialReportHtml(data, { companyName: 'HeyHomie' });
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${data.title} report` });
    }
    return uri;
}

/** Render a single invoice to PDF and open the share sheet. */
export async function exportInvoicePdf(inv: Invoice): Promise<string> {
    const html = invoiceHtml(inv, { companyName: 'HeyHomie' });
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${inv.number}` });
    }
    return uri;
}

/**
 * Write a JPK_V7 XML draft to a file and open the share sheet. The XML is a
 * SIMPLIFIED draft (see jpk.ts) — not submittable to the tax office as-is.
 */
export async function exportJpkXml(xml: string, label: string): Promise<string> {
    const uri = `${FileSystem.cacheDirectory}JPK_${label}.xml`;
    await FileSystem.writeAsStringAsync(uri, xml, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/xml', dialogTitle: `JPK ${label} (draft)` });
    }
    return uri;
}
