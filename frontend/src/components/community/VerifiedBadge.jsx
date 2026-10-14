/** Byro has checked this organiser is who they say. Shown beside the community's name. */
export default function VerifiedBadge({ size = 20, className = "" }) {
  return (
    <span title="Verified by Byro" className={`inline-flex shrink-0 align-middle ${className}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#3669F6"
          d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z"
        />
        <path d="M8.5 12.2l2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Verified by Byro</span>
    </span>
  );
}
