import { test, expect } from 'vitest'
import { commonPayeeText } from '../links'

test('the longest run of words every payee shares, as the first one writes it', () => {
  expect(commonPayeeText(['Virement vers Livret A', 'virement depuis Joint Checking'])).toBe('Virement')
  expect(commonPayeeText(['PRLV SEPA FREE MOBILE', 'PRLV SEPA FREE TELECOM', 'Remb prlv sepa free'])).toBe('PRLV SEPA FREE')
})

test('nothing when no whole word is shared', () => {
  expect(commonPayeeText(['Dr Martin dentiste', 'CPAM remboursement', 'MGEN mutuelle'])).toBe('')
  expect(commonPayeeText(['Carrefour', 'Carrefour Market'])).toBe('Carrefour')
  expect(commonPayeeText(['Carrefours', 'Carrefour'])).toBe('')
  expect(commonPayeeText([])).toBe('')
})
