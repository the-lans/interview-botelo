import React from "react";

import { dashboardCopy } from "../dashboard.copy";
import type { BriefFormState } from "../dashboard.types";

interface BriefStepProps {
  brief: BriefFormState;
  priorityOptions: readonly string[];
  onBriefChange: (next: BriefFormState) => void;
  onPriorityChange: (value: string, checked: boolean) => void;
}

export function BriefStep({
  brief,
  onBriefChange,
  onPriorityChange,
  priorityOptions,
}: BriefStepProps): JSX.Element {
  return (
    <div className="card section">
      <h2>{dashboardCopy.step2.title}</h2>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="target-role">{dashboardCopy.step2.targetRole}</label>
          <input
            id="target-role"
            value={brief.target_role}
            onChange={(event) =>
              onBriefChange({ ...brief, target_role: event.target.value })
            }
            placeholder={dashboardCopy.step2.targetRolePlaceholder}
          />
        </div>

        <div className="field">
          <label htmlFor="level">{dashboardCopy.step2.level}</label>
          <select
            id="level"
            value={brief.level}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                level: event.target.value as BriefFormState["level"],
              })
            }
          >
            <option>Junior</option>
            <option>Junior+</option>
            <option>Middle</option>
            <option>Middle+</option>
            <option>Senior</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="horizon">{dashboardCopy.step2.horizon}</label>
          <select
            id="horizon"
            value={brief.horizon_weeks}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                horizon_weeks: Number(event.target.value) as 2 | 4 | 6,
              })
            }
          >
            <option value={2}>2 недели</option>
            <option value={4}>4 недели</option>
            <option value={6}>6 недель</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="plan-format">{dashboardCopy.step2.planFormat}</label>
          <select
            id="plan-format"
            value={brief.plan_format}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                plan_format: event.target.value as BriefFormState["plan_format"],
              })
            }
          >
            <option value="themes">темы</option>
            <option value="themes+practice">темы+практика</option>
            <option value="themes+practice+mock_interview">
              темы+практика+mock interview
            </option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="weekday-hours">{dashboardCopy.step2.weekdayHours}</label>
          <input
            id="weekday-hours"
            type="number"
            min={0}
            value={brief.weekday_hours}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                weekday_hours: Number(event.target.value),
              })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="weekend-hours">{dashboardCopy.step2.weekendHours}</label>
          <input
            id="weekend-hours"
            type="number"
            min={0}
            value={brief.weekend_hours}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                weekend_hours: Number(event.target.value),
              })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="language">{dashboardCopy.step2.language}</label>
          <select
            id="language"
            value={brief.language}
            onChange={(event) =>
              onBriefChange({
                ...brief,
                language: event.target.value as BriefFormState["language"],
              })
            }
          >
            <option value="RU">RU</option>
            <option value="EN">EN</option>
          </select>
        </div>
      </div>

      <fieldset className="priority-fieldset">
        <legend>{dashboardCopy.step2.priorities}</legend>
        <div className="priority-grid">
          {priorityOptions.map((item) => (
            <label key={item} className="priority-item">
              <input
                type="checkbox"
                checked={brief.priorities.includes(item)}
                onChange={(event) => onPriorityChange(item, event.target.checked)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="other-priority">{dashboardCopy.step2.otherPriority}</label>
          <input
            id="other-priority"
            value={brief.other_priority}
            onChange={(event) =>
              onBriefChange({ ...brief, other_priority: event.target.value })
            }
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="constraints">{dashboardCopy.step2.constraints}</label>
        <textarea
          id="constraints"
          value={brief.constraints}
          onChange={(event) =>
            onBriefChange({ ...brief, constraints: event.target.value })
          }
          rows={4}
        />
      </div>
    </div>
  );
}
