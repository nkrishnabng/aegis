import type { CSSProperties } from "react";

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

/** Shared SVG frame -- thin-line icons matching the Aegis design language. */
function Svg({
  size = 16,
  color = "currentColor",
  strokeWidth = 1.7,
  style,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {children}
    </svg>
  );
}

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 4.5 5.5V11c0 5.2 3.2 9.4 7.5 11 4.3-1.6 7.5-5.8 7.5-11V5.5L12 2.5Z" />
    <path d="m8.5 12 2.3 2.3L15.5 9.7" />
  </Svg>
);

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const BotIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

/** Microscope / self-healing locator glyph. */
export const HealIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22v-5M9 8V2M15 8V2M9 8a3 3 0 0 0 6 0M12 17a5 5 0 0 0 5-5V8H7v4a5 5 0 0 0 5 5z" />
  </Svg>
);

/** Plug glyph -- external integrations (Jira, etc). */
export const PlugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2v4M15 2v4M7 8h10l-1 5a4 4 0 0 1-4 3.5A4 4 0 0 1 8 13z" />
    <path d="M12 16.5V22" />
  </Svg>
);

/** Branching nodes glyph -- reusable flows. */
export const FlowIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="12" r="2.5" />
    <path d="M8.2 7.2 15.8 11M8.2 16.8 15.8 13" />
  </Svg>
);

/** Overlapping frames glyph -- visual regression / screenshot comparison. */
export const CompareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="13" height="13" rx="1.5" />
    <path d="M8 21h13V8" />
  </Svg>
);

/** Lined list glyph -- audit log. */
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5h12M9 12h12M9 19h12" />
    <path d="M4 5h.01M4 12h.01M4 19h.01" strokeWidth={3} />
  </Svg>
);

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const BugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1" />
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
    <path d="M12 20v-9M6.5 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M21 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
  </Svg>
);

export const BarChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M18 17V9M13 17V5M8 17v-3" />
  </Svg>
);

export const HelpCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
