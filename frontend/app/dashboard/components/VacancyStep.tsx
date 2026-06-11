import React from "react";

import { dashboardCopy } from "../dashboard.copy";
import type { VacancyMode } from "../dashboard.types";

interface VacancyStepProps {
  isLoading: boolean;
  resumeText: string;
  vacancyInput: string;
  vacancyMode: VacancyMode;
  vacancyText: string;
  onResumeTextChange: (value: string) => void;
  onVacancyInputChange: (value: string) => void;
  onVacancyModeChange: (mode: VacancyMode) => void;
  onIngest: () => void;
}

export function VacancyStep(props: VacancyStepProps): JSX.Element {
  const {
    isLoading,
    onIngest,
    onResumeTextChange,
    onVacancyInputChange,
    onVacancyModeChange,
    resumeText,
    vacancyInput,
    vacancyMode,
    vacancyText,
  } = props;

  return (
    <div className="card section">
      <h2>{dashboardCopy.step1.title}</h2>
      <div className="field">
        <label htmlFor="resume-text">{dashboardCopy.step1.resumeLabel}</label>
        <textarea
          id="resume-text"
          value={resumeText}
          onChange={(event) => onResumeTextChange(event.target.value)}
          rows={5}
          placeholder={dashboardCopy.step1.resumePlaceholder}
        />
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="vacancy-source">
            {dashboardCopy.step1.vacancySourceLabel}
          </label>
          <select
            id="vacancy-source"
            value={vacancyMode}
            onChange={(event) =>
              onVacancyModeChange(event.target.value as VacancyMode)
            }
          >
            <option value="raw_text">{dashboardCopy.step1.vacancySourceRaw}</option>
            <option value="url">{dashboardCopy.step1.vacancySourceUrl}</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="vacancy-input">{dashboardCopy.step1.vacancyInputLabel}</label>
        <textarea
          id="vacancy-input"
          rows={5}
          value={vacancyInput}
          onChange={(event) => onVacancyInputChange(event.target.value)}
          placeholder={
            vacancyMode === "url"
              ? dashboardCopy.step1.vacancyInputUrlPlaceholder
              : dashboardCopy.step1.vacancyInputTextPlaceholder
          }
        />
      </div>

      <button type="button" onClick={onIngest} disabled={isLoading}>
        {isLoading
          ? dashboardCopy.step1.ingestLoading
          : dashboardCopy.step1.ingestAction}
      </button>

      <div className="field">
        <label htmlFor="vacancy-processed">{dashboardCopy.step1.processedLabel}</label>
        <textarea
          id="vacancy-processed"
          rows={5}
          value={vacancyText}
          readOnly
          placeholder={dashboardCopy.step1.processedPlaceholder}
        />
      </div>
    </div>
  );
}
