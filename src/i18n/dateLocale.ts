import { useTranslation } from 'react-i18next'
import { id as idLocale, enUS } from 'date-fns/locale'

// date-fns needs its own locale object passed to format() — it doesn't
// follow i18next's language setting on its own. Use this anywhere a page
// already imports date-fns' format() and wants month/day names (MMMM,
// EEEE, …) to follow the language toggle too.
export function useDateLocale() {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage?.startsWith('id') ? idLocale : enUS
}
