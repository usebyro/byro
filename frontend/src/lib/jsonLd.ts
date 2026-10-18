/**
 * Serialize a JSON-LD object for a <script> tag. JSON.stringify doesn't escape <, > or &, so text
 * from a CMS or an organiser could close the script element; escaping those three keeps it valid JSON.
 */
export function serializeJsonLd(obj: unknown) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}
