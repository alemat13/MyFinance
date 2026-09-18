import type { CsvValue } from './csv'

export async function buildXlsxBlob(headers: string[], rows: CsvValue[][]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const data = [headers, ...rows]
  return writeExcelFile(data).toBlob()
}
