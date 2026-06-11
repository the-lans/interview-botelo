import React from "react";

import type { GeneratePlanResponse } from "@/lib/types/api.types";

import { dashboardCopy } from "../dashboard.copy";

interface PlanResultSectionProps {
  planResult: GeneratePlanResponse | null;
}

export function PlanResultSection({
  planResult,
}: PlanResultSectionProps): JSX.Element {
  return (
    <div className="card section">
      <h2>{dashboardCopy.step4.title}</h2>
      {!planResult && <p className="muted">{dashboardCopy.step4.emptyPlan}</p>}
      {planResult && (
        <div className="plan-result">
          <p>
            <strong>{dashboardCopy.step4.planId}</strong> {planResult.plan_id || "-"}
          </p>

          {Array.isArray(planResult.plan.weeks) && planResult.plan.weeks.length > 0 ? (
            <div className="plan-list">
              {planResult.plan.weeks.map((week, index) => (
                <div key={week.week || index} className="plan-item">
                  <h3>
                    {dashboardCopy.step4.weekPrefix} {week.week || index + 1}
                  </h3>
                  {Array.isArray(week.themes) && week.themes.length > 0 ? (
                    <ul>
                      {week.themes.map((topic) => (
                        <li key={topic}>{topic}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">{dashboardCopy.step4.emptyThemes}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <pre>{JSON.stringify(planResult.plan, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
