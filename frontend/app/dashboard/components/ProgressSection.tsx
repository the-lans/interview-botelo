import React from "react";

import type { ProgressData, ProgressStatus } from "@/lib/types/api.types";

import {
  progressMetricLabels,
  progressStatusLabels,
  progressStatusOptions,
} from "../dashboard.config";
import { dashboardCopy } from "../dashboard.copy";
import type { ProgressMetric } from "../dashboard.types";
import { formatProgressDate } from "../dashboard.utils";

interface ProgressSectionProps {
  isLoading: boolean;
  needsLogin: boolean;
  progressData: ProgressData;
  progressError: string;
  progressMetrics: ProgressMetric[];
  updatingTopic: string;
  onRetry: () => void;
  onStatusChange: (topic: string, status: ProgressStatus) => void;
}

export function ProgressSection({
  isLoading,
  needsLogin,
  onRetry,
  onStatusChange,
  progressData,
  progressError,
  progressMetrics,
  updatingTopic,
}: ProgressSectionProps): JSX.Element {
  return (
    <div className="card section">
      <div className="progress-header">
        <div>
          <h2>{dashboardCopy.step4.progressTitle}</h2>
          <p className="muted">{dashboardCopy.step4.progressSubtitle}</p>
        </div>
        <div
          className="progress-ring"
          aria-label={`Прогресс ${progressData.summary.completion_percent}%`}
        >
          <strong>{progressData.summary.completion_percent}%</strong>
          <span>{dashboardCopy.step4.completionSuffix}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <p>{dashboardCopy.step4.loadingProgress}</p>
        </div>
      ) : progressError ? (
        <div className="empty-state empty-state-error">
          <p>{dashboardCopy.step4.progressLoadError}</p>
          <p className="muted">{progressError}</p>
          <button type="button" onClick={onRetry}>
            {dashboardCopy.step4.retry}
          </button>
        </div>
      ) : needsLogin ? null : (
        <div className="progress-layout">
          <div className="progress-column">
            <div className="progress-summary-grid">
              {progressMetrics.map((metric) => (
                <article key={metric.key} className="progress-metric-card">
                  <span>{progressMetricLabels[metric.key]}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>

            {progressData.topics.length === 0 ? (
              <div className="empty-state">
                <p>{dashboardCopy.step4.emptyTopics}</p>
                <p className="muted">{dashboardCopy.step4.emptyTopicsHint}</p>
              </div>
            ) : (
              <div className="progress-topics-grid">
                {progressData.topics.map((item) => {
                  const isSaving = updatingTopic === item.topic;
                  return (
                    <article key={item.topic} className="progress-topic-card">
                      <div className="progress-topic-head">
                        <div>
                          <h3>{item.topic}</h3>
                          <p className="muted">
                            {dashboardCopy.step4.updatedAtPrefix}{" "}
                            {formatProgressDate(item.updated_at)}
                          </p>
                        </div>
                        <span className={`status-badge status-${item.status}`}>
                          {progressStatusLabels[item.status]}
                        </span>
                      </div>

                      <label className="progress-select-field">
                        <span>{dashboardCopy.step4.statusLabel}</span>
                        <select
                          aria-label={`Статус темы ${item.topic}`}
                          value={item.status}
                          disabled={isSaving}
                          onChange={(event) =>
                            onStatusChange(
                              item.topic,
                              event.target.value as ProgressStatus,
                            )
                          }
                        >
                          {progressStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {isSaving && <p className="muted">{dashboardCopy.step4.saving}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="progress-history-card">
            <h3>{dashboardCopy.step4.historyTitle}</h3>
            {progressData.history.length === 0 ? (
              <p className="muted">{dashboardCopy.step4.emptyHistory}</p>
            ) : (
              <ul className="history-list">
                {progressData.history.map((entry, index) => (
                  <li
                    key={`${entry.topic}-${entry.updated_at}-${index}`}
                    className="history-item"
                  >
                    <div>
                      <strong>{entry.topic}</strong>
                      <p className="muted">
                        {formatProgressDate(entry.updated_at)}
                      </p>
                    </div>
                    <span className={`status-badge status-${entry.status}`}>
                      {progressStatusLabels[entry.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
