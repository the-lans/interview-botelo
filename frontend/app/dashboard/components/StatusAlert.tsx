import React from "react";

import { statusTypeMap } from "../dashboard.config";
import type { DashboardStatus } from "../dashboard.types";

interface StatusAlertProps {
  status: DashboardStatus;
}

export function StatusAlert({ status }: StatusAlertProps): JSX.Element | null {
  if (!status.message) {
    return null;
  }

  const statusClass =
    status.type === ""
      ? "alert-info"
      : statusTypeMap[status.type];

  return (
    <div className={`alert ${statusClass}`} role="status" aria-live="polite">
      {status.message}
    </div>
  );
}
