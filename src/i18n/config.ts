import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en/translation.json'
import id from './locales/id/translation.json'

// English and Bahasa Indonesia only, for now — print documents (invoices,
// kwitansi, surat jalan, price lists) are deliberately NOT wired to this:
// they're formal Indonesian business documents that stay in Indonesian
// regardless of what the staff UI is set to.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      id: { translation: id },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'id'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'kma-language',
    },
  })

export default i18n
