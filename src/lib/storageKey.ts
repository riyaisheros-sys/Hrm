/**
 * Supabase Storage rejects object keys containing anything outside a narrow
 * ASCII set ("Invalid key"): non-Latin scripts, brackets, '#', and the hidden
 * narrow no-break space that WhatsApp / macOS put before "AM"/"PM" in image
 * names. Uploads must never embed the raw file name in the key.
 *
 * Returns a key-safe version of `fileName`: ASCII letters, digits, '.', '_'
 * and '-' only, extension preserved, never empty.
 */
export function safeFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const rawBase = dot > 0 ? fileName.slice(0, dot) : fileName
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : ''
  const clean = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  const base = clean(rawBase).slice(0, 80) || 'file'
  const ext = clean(rawExt).slice(0, 10).toLowerCase()
  return ext ? `${base}.${ext}` : base
}
