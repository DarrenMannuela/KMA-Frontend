import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enBase from './locales/en/translation.json'
import idBase from './locales/id/translation.json'

type Tree = { [key: string]: string | Tree }

const merge = (into: Tree, from: Tree): Tree => {
  for (const [k, v] of Object.entries(from)) {
    const cur = into[k]
    into[k] = typeof v === 'object' && typeof cur === 'object' ? merge({ ...cur }, v) : v
  }
  return into
}

// Each screen area can keep its strings in its own file next to
// translation.json (e.g. locales/en/ledger.json), merged into the one
// "translation" namespace, so t('ledger.…') works without a namespace prefix.
const areas = (files: Record<string, { default: Tree }>) =>
  Object.entries(files)
    .filter(([path]) => !path.endsWith('/translation.json'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default)

const en = areas(import.meta.glob('./locales/en/*.json', { eager: true })).reduce(merge, merge({}, enBase as Tree))
const id = areas(import.meta.glob('./locales/id/*.json', { eager: true })).reduce(merge, merge({}, idBase as Tree))

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
