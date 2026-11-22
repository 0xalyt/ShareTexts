type Step = 'open' | 'pair' | 'arrive';

/** Original cut-paper drawings, not controls or live connection state.
 * The adjacent translated instructions carry the meaning. */
export function HandoffIllustration({ step }: { step: Step }) {
  return (
    <svg className={`handoff-art handoff-art-${step}`} viewBox="0 0 320 240" fill="none" aria-hidden="true" focusable="false" data-illustration={step}>
      <ellipse cx="160" cy="218" rx="122" ry="9" className="handoff-art-shadow" />
      {step === 'open' && <>
        {/* The same little note waves from both screens. */}
        <path d="M49 55h181a14 14 0 0 1 14 14v126H35V69a14 14 0 0 1 14-14Z" className="handoff-art-edge" />
        <rect x="39" y="49" width="201" height="140" rx="14" className="handoff-art-shell" />
        <rect x="48" y="59" width="183" height="119" rx="6" className="handoff-art-screen" />
        <path d="M48 78h183" className="handoff-art-rule" />
        <circle cx="59" cy="69" r="2" className="handoff-art-ink" />
        <circle cx="67" cy="69" r="2" className="handoff-art-ink" opacity=".35" />
        <circle cx="75" cy="69" r="2" className="handoff-art-ink" opacity=".2" />
        <path d="M27 189h225l15 15c2 3-2 8-7 8H20c-5 0-8-5-5-8l12-15Z" className="handoff-art-shell" />
        <path d="M15 204h252c0 5-4 9-9 9H24c-5 0-9-4-9-9Z" className="handoff-art-edge" />
        <path d="M113 190h54l5 6h-64l5-6Z" className="handoff-art-edge" opacity=".4" />
        <g transform="rotate(-7 141 127)">
          <rect x="106" y="92" width="73" height="75" rx="10" className="handoff-art-paper-shadow" />
          <rect x="102" y="87" width="73" height="75" rx="10" className="handoff-art-paper" />
          <path d="M103 125c-13 0-17-6-19-15m2 3-6-2m4-1 2-6M174 124c9-4 12-11 11-20m0 4 5-5m-5 2-4-4" className="handoff-art-gesture" />
          <circle cx="125" cy="111" r="3.5" className="handoff-art-ink" />
          <circle cx="147" cy="111" r="3.5" className="handoff-art-ink" />
          <path d="M127 124q9 10 18-1" className="handoff-art-smile" />
          <path d="M118 143h17" className="handoff-art-writing" opacity=".3" />
          <rect x="147" y="134" width="13" height="13" rx="4" className="handoff-art-accent" />
        </g>
        <g transform="rotate(8 247 158)">
          <rect x="215" y="102" width="64" height="111" rx="14" className="handoff-art-edge" />
          <rect x="210" y="97" width="64" height="111" rx="14" className="handoff-art-shell" />
          <rect x="216" y="104" width="52" height="96" rx="9" className="handoff-art-screen" />
          <path d="M235 109h14" className="handoff-art-writing" />
          <rect x="224" y="125" width="36" height="43" rx="6" className="handoff-art-paper-shadow" />
          <rect x="221" y="122" width="36" height="43" rx="6" className="handoff-art-paper" />
          <circle cx="233" cy="135" r="2" className="handoff-art-ink" />
          <circle cx="245" cy="135" r="2" className="handoff-art-ink" />
          <path d="M234 143q5 5 10-1" className="handoff-art-smile" />
          <rect x="244" y="151" width="7" height="7" rx="2" className="handoff-art-accent" />
          <path d="M235 193h14" className="handoff-art-rule" />
        </g>
      </>}
      {step === 'pair' && <>
        {/* Joined loops and a six-part code make one connection. */}
        <g transform="rotate(-9 78 139)">
          <rect x="39" y="68" width="78" height="143" rx="17" className="handoff-art-edge" />
          <rect x="35" y="63" width="78" height="143" rx="17" className="handoff-art-shell" />
          <rect x="42" y="71" width="64" height="126" rx="11" className="handoff-art-screen" />
          <path d="M66 77h16" className="handoff-art-writing" />
          <path d="M61 175h26M61 183h17" className="handoff-art-rule" />
        </g>
        <g transform="rotate(9 245 126)">
          <rect x="208" y="47" width="78" height="155" rx="17" className="handoff-art-edge" />
          <rect x="204" y="42" width="78" height="155" rx="17" className="handoff-art-shell" />
          <rect x="211" y="50" width="64" height="138" rx="11" className="handoff-art-screen" />
          <path d="M235 56h16" className="handoff-art-writing" />
          <path d="M231 167h25M231 175h16" className="handoff-art-rule" />
        </g>
        <path d="M75 129c0-42 171-57 171 0" className="handoff-art-thread" />
        <rect x="99" y="83" width="130" height="109" rx="16" className="handoff-art-paper-shadow" />
        <rect x="94" y="77" width="130" height="109" rx="16" className="handoff-art-paper" />
        <rect x="122" y="93" width="45" height="27" rx="13.5" transform="rotate(-32 144 106)" className="handoff-art-link-back" />
        <rect x="151" y="102" width="45" height="27" rx="13.5" transform="rotate(-32 173 115)" className="handoff-art-link-front" />
        <path d="m151 103 10-6" className="handoff-art-link-join" />
        <g className="handoff-art-code">
          {[115, 131, 147, 171, 187, 203].map(x => <rect key={x} x={x - 5} y="154" width="10" height="15" rx="4" />)}
        </g>
        <circle cx="242" cy="66" r="16" className="handoff-art-seal" />
        <path d="m235 66 5 5 9-10" className="handoff-art-check" />
      </>}
      {step === 'arrive' && <>
        {/* Text, a photo and a file arrive, without a fabricated progress claim. */}
        <rect x="119" y="34" width="95" height="179" rx="21" className="handoff-art-edge" />
        <rect x="113" y="28" width="95" height="179" rx="21" className="handoff-art-shell" />
        <rect x="121" y="37" width="79" height="160" rx="14" className="handoff-art-screen" />
        <path d="M150 44h22" className="handoff-art-writing" />
        <path d="M147 189h27" className="handoff-art-rule" />
        <g transform="rotate(-13 84 127)">
          <rect x="39" y="83" width="103" height="94" rx="12" className="handoff-art-paper-shadow" />
          <rect x="34" y="77" width="103" height="94" rx="12" className="handoff-art-paper" />
          <rect x="42" y="85" width="87" height="68" rx="6" className="handoff-art-photo-sky" />
          <circle cx="108" cy="102" r="9" className="handoff-art-photo-sun" />
          <path d="m42 133 24-24c3-3 5-3 8 0l24 25 13-12c2-2 5-2 7 0l11 11v14a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6v-14Z" className="handoff-art-photo-hill" />
        </g>
        <g transform="rotate(12 239 100)">
          <path d="M216 62h37l21 21v61a9 9 0 0 1-9 9h-49a9 9 0 0 1-9-9V71a9 9 0 0 1 9-9Z" className="handoff-art-paper-shadow" />
          <path d="M211 56h37l21 21v61a9 9 0 0 1-9 9h-49a9 9 0 0 1-9-9V65a9 9 0 0 1 9-9Z" className="handoff-art-paper" />
          <path d="M248 56v15a6 6 0 0 0 6 6h15" className="handoff-art-fold" />
          <circle cx="220" cy="95" r="3" className="handoff-art-ink" />
          <path d="m237 94 4 2-4 2M223 107q8 9 16-1" className="handoff-art-smile" />
          <path d="M218 128h24" className="handoff-art-writing" opacity=".3" />
        </g>
        <path d="M146 136h73a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12h-52l-18 12v-12h-3a12 12 0 0 1-12-12v-22a12 12 0 0 1 12-12Z" className="handoff-art-message" />
        <path d="M150 153h63M150 165h42" className="handoff-art-writing" />
        <circle cx="235" cy="191" r="22" className="handoff-art-seal" />
        <path d="m225 191 7 7 14-16" className="handoff-art-check" />
      </>}
    </svg>
  );
}
