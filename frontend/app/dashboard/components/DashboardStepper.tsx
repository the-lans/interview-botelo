import React from "react";

import { dashboardCopy } from "../dashboard.copy";

interface DashboardStepperProps {
  currentStep: number;
  maxUnlockedStep: number;
  onStepChange: (step: number) => void;
}

export function DashboardStepper({
  currentStep,
  maxUnlockedStep,
  onStepChange,
}: DashboardStepperProps): JSX.Element {
  return (
    <div className="card section">
      <h2>Шаги подготовки</h2>
      <div className="stepper" role="tablist" aria-label="Шаги dashboard">
        {dashboardCopy.steps.map((label, index) => {
          const disabled = index > maxUnlockedStep;
          return (
            <button
              key={label}
              role="tab"
              type="button"
              className={`stepper-item ${index === currentStep ? "active" : ""}`}
              onClick={() => onStepChange(index)}
              disabled={disabled}
              aria-selected={index === currentStep}
            >
              <span className="step-number">{index + 1}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
