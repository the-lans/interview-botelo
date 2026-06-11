import React from "react";

import { dashboardCopy } from "../dashboard.copy";

interface GenerateStepProps {
  canMoveToGenerate: boolean;
  isGenerateLoading: boolean;
  onGenerate: () => void;
}

export function GenerateStep({
  canMoveToGenerate,
  isGenerateLoading,
  onGenerate,
}: GenerateStepProps): JSX.Element {
  return (
    <div className="card section">
      <h2>{dashboardCopy.step3.title}</h2>
      <p className="muted">{dashboardCopy.step3.subtitle}</p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canMoveToGenerate || isGenerateLoading}
      >
        {isGenerateLoading
          ? dashboardCopy.step3.loading
          : dashboardCopy.step3.action}
      </button>
    </div>
  );
}
