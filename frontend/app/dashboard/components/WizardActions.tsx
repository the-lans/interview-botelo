import React from "react";

import { dashboardCopy } from "../dashboard.copy";

interface WizardActionsProps {
  canGoBack: boolean;
  canGoNext: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export function WizardActions({
  canGoBack,
  canGoNext,
  onNext,
  onPrevious,
}: WizardActionsProps): JSX.Element {
  return (
    <div className="wizard-actions">
      <button type="button" onClick={onPrevious} disabled={!canGoBack}>
        {dashboardCopy.actions.previous}
      </button>
      <button type="button" onClick={onNext} disabled={!canGoNext}>
        {dashboardCopy.actions.next}
      </button>
    </div>
  );
}
