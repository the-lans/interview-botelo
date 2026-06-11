import React from "react";

import { dashboardCopy } from "../dashboard.copy";

interface DashboardHeaderProps {
  isLogoutLoading: boolean;
  onLogout: () => void;
}

export function DashboardHeader({
  isLogoutLoading,
  onLogout,
}: DashboardHeaderProps): JSX.Element {
  return (
    <header className="card section header-section">
      <div>
        <h1>{dashboardCopy.title}</h1>
        <p className="muted">{dashboardCopy.subtitle}</p>
      </div>
      <button type="button" onClick={onLogout} disabled={isLogoutLoading}>
        {isLogoutLoading
          ? dashboardCopy.actions.logoutLoading
          : dashboardCopy.actions.logout}
      </button>
    </header>
  );
}
