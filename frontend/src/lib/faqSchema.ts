/** FAQPage structured data for a list of questions: the same text visitors read, in a form search and AI tools can quote. */
export function faqPageJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** JSON for a script tag: < > & escaped so text in an answer can never close the tag. */
export function serializeJsonLd(obj: unknown) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
