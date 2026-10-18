import {ImageResponse} from 'next/og'

/** A 1200×630 link-preview card on Byro blue: a small label, a big headline, and the address. */
export function shareCard({label, headline, footer}: {label: string; headline: string; footer: string}) {
  const text = headline.slice(0, 110)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#3669F6',
          color: '#FFFFFF',
          padding: '72px 80px',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
          <div style={{display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: -1}}>byro</div>
          <div style={{display: 'flex', background: '#FFFFFF', color: '#2451D6', borderRadius: 999, padding: '8px 22px', fontSize: 26, fontWeight: 700}}>
            {label}
          </div>
        </div>
        <div style={{display: 'flex', fontSize: text.length > 60 ? 64 : text.length > 30 ? 80 : 120, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2}}>
          {text}
        </div>
        <div style={{display: 'flex', fontSize: 30, opacity: 0.85}}>{footer}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'},
    },
  )
}
