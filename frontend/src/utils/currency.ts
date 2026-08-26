export const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const

export function formatMoney(amount: number, currency: string): string {
  try {
    return amount.toLocaleString('en-US', { style: 'currency', currency })
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
