"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserSummary } from "@testingmcp/shared";
import { api } from "../lib/api";
import {
  BarChartIcon,
  BotIcon,
  BugIcon,
  ChevronDownIcon,
  CompareIcon,
  DashboardIcon,
  FlowIcon,
  FolderIcon,
  HealIcon,
  HelpCircleIcon,
  ListIcon,
  LogoutIcon,
  PlugIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "./icons";
import type { IconProps } from "./icons";

interface NavItemDef {
  label: string;
  href: string;
  Icon: (p: IconProps) => React.ReactNode;
  /** Exact-match only (e.g. the project workspace root); otherwise prefix-match. */
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItemDef[];
}

function baseNavGroup(isAdmin: boolean): NavGroup {
  return {
    label: "Workspace",
    items: [
      { label: "Projects", href: "/", Icon: FolderIcon, exact: true },
      ...(isAdmin ? [{ label: "Admin", href: "/admin", Icon: UsersIcon }] : []),
      { label: "Help & Docs", href: "/help", Icon: HelpCircleIcon },
    ],
  };
}

function projectNavGroups(projectId: string): NavGroup[] {
  const base = `/project/${projectId}`;
  return [
    { label: "Overview", items: [{ label: "Dashboard", href: `${base}/dashboard`, Icon: DashboardIcon }] },
    {
      label: "Workflow",
      items: [
        { label: "Test Generation", href: base, Icon: BotIcon, exact: true },
        { label: "Flows", href: `${base}/flows`, Icon: FlowIcon },
        { label: "Environments", href: `${base}/environments`, Icon: SettingsIcon },
        { label: "Integrations", href: `${base}/integrations`, Icon: PlugIcon },
        { label: "Self-Healing", href: `${base}/healing`, Icon: HealIcon },
        { label: "Visual Regression", href: `${base}/visual-regression`, Icon: CompareIcon },
        { label: "Failing Tests", href: `${base}/failing-tests`, Icon: BugIcon },
      ],
    },
    { label: "Insights", items: [{ label: "Reports", href: `${base}/reports`, Icon: BarChartIcon }] },
    {
      label: "Project Settings",
      items: [
        { label: "Members", href: `${base}/members`, Icon: UsersIcon },
        { label: "Audit Log", href: `${base}/audit-log`, Icon: ListIcon },
      ],
    },
  ];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0][0], parts[1][0]] : [name.slice(0, 2)];
  return chars.join("").toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<UserSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const projectMatch = /^\/project\/([^/]+)/.exec(pathname ?? "");
  const projectId = projectMatch ? projectMatch[1] : null;

  async function handleLogout() {
    await api.logout();
    router.push("/login");
  }

  function isActive(item: NavItemDef): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
  }

  function NavLink({ item }: { item: NavItemDef }) {
    const active = isActive(item);
    const { Icon } = item;
    return (
      <a href={item.href} className={`sidebar-nav-item ${active ? "active" : ""}`}>
        <Icon size={17} color={active ? "var(--accent)" : "var(--text-dim)"} strokeWidth={1.7} />
        <span>{item.label}</span>
      </a>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <ShieldIcon size={17} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div className="sidebar-brand-name">
            Aegis<span style={{ color: "var(--accent)" }}>QA</span>
          </div>
          <div className="sidebar-brand-tagline">AGENTIC TESTING</div>
        </div>
      </div>

      <div className="sidebar-nav">
        <div className="sidebar-group-label">{baseNavGroup(me?.role === "admin").label}</div>
        {baseNavGroup(me?.role === "admin").items.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {projectId &&
          projectNavGroups(projectId).map((group) => (
            <div key={group.label}>
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          ))}
      </div>

      {me && (
        <div className="sidebar-footer" style={{ position: "relative" }} ref={menuRef}>
          {menuOpen && (
            <div
              className="card"
              style={{ position: "absolute", bottom: "100%", left: 12, right: 12, marginBottom: 6, padding: 6, zIndex: 20 }}
            >
              <a
                href="/profile"
                className="sidebar-nav-item"
                onClick={() => setMenuOpen(false)}
                style={{ borderRadius: 8 }}
              >
                <UserIcon size={16} color="var(--text-dim)" strokeWidth={1.7} />
                <span>Profile</span>
              </a>
              <button
                onClick={handleLogout}
                className="sidebar-nav-item"
                style={{
                  borderRadius: 8,
                  width: "100%",
                  textAlign: "left",
                  font: "inherit",
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
              >
                <LogoutIcon size={16} color="var(--danger)" strokeWidth={1.7} />
                <span style={{ color: "var(--danger)" }}>Log out</span>
              </button>
            </div>
          )}
          <button className="user-card" onClick={() => setMenuOpen((o) => !o)} title="Account menu">
            <div className="user-avatar">{initials(me.username)}</div>
            <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
              <div className="user-card-name">{me.username}</div>
              <div className="user-card-role">{me.role}</div>
            </div>
            <ChevronDownIcon
              size={15}
              color="var(--text-dim)"
              strokeWidth={1.7}
              style={{ transition: "transform 0.15s", transform: menuOpen ? "rotate(180deg)" : "none" }}
            />
          </button>
        </div>
      )}
    </aside>
  );
}
