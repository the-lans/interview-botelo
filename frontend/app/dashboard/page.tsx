"use client";

import React from "react";

import { priorityOptions } from "./dashboard.config";
import { dashboardCopy } from "./dashboard.copy";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardStepper } from "./components/DashboardStepper";
import { GenerateStep } from "./components/GenerateStep";
import { PlanResultSection } from "./components/PlanResultSection";
import { ProgressSection } from "./components/ProgressSection";
import { StatusAlert } from "./components/StatusAlert";
import { VacancyStep } from "./components/VacancyStep";
import { BriefStep } from "./components/BriefStep";
import { WizardActions } from "./components/WizardActions";
import { useDashboard } from "./hooks/useDashboard";

export default function DashboardPage(): JSX.Element {
  const {
    state,
    canMoveToGenerate,
    maxUnlockedStep,
    progressMetrics,
    setBrief,
    setCurrentStep,
    setResumeText,
    setVacancyInput,
    setVacancyMode,
    goNext,
    goPrev,
    handleGeneratePlan,
    handleIngestVacancy,
    handleLogout,
    handlePriorityChange,
    handleProgressStatusChange,
    loadProgress,
  } = useDashboard();

  return (
    <section className="dashboard">
      <DashboardHeader
        isLogoutLoading={state.isLogoutLoading}
        onLogout={() => void handleLogout()}
      />

      <DashboardStepper
        currentStep={state.currentStep}
        maxUnlockedStep={maxUnlockedStep}
        onStepChange={setCurrentStep}
      />

      <StatusAlert status={state.status} />

      {state.needsLogin && (
        <div className="card section">
          <a href="/?redirect=/dashboard">{dashboardCopy.messages.authRedirect}</a>
        </div>
      )}

      {state.currentStep === 0 && (
        <VacancyStep
          isLoading={state.isIngestLoading}
          resumeText={state.resumeText}
          vacancyInput={state.vacancyInput}
          vacancyMode={state.vacancyMode}
          vacancyText={state.vacancyText}
          onResumeTextChange={setResumeText}
          onVacancyInputChange={setVacancyInput}
          onVacancyModeChange={setVacancyMode}
          onIngest={() => void handleIngestVacancy()}
        />
      )}

      {state.currentStep === 1 && (
        <BriefStep
          brief={state.brief}
          priorityOptions={priorityOptions}
          onBriefChange={setBrief}
          onPriorityChange={handlePriorityChange}
        />
      )}

      {state.currentStep === 2 && (
        <GenerateStep
          canMoveToGenerate={canMoveToGenerate}
          isGenerateLoading={state.isGenerateLoading}
          onGenerate={() => void handleGeneratePlan()}
        />
      )}

      {state.currentStep === 3 && (
        <>
          <PlanResultSection planResult={state.planResult} />
          <ProgressSection
            isLoading={state.isProgressLoading}
            needsLogin={state.needsLogin}
            progressData={state.progressData}
            progressError={state.progressError}
            progressMetrics={progressMetrics}
            updatingTopic={state.updatingTopic}
            onRetry={() =>
              void loadProgress({
                errorMessage: dashboardCopy.messages.progressLoadFailed,
              })
            }
            onStatusChange={(topic, nextStatus) =>
              void handleProgressStatusChange(topic, nextStatus)
            }
          />
        </>
      )}

      <WizardActions
        canGoBack={state.currentStep > 0}
        canGoNext={state.currentStep < maxUnlockedStep}
        onNext={goNext}
        onPrevious={goPrev}
      />
    </section>
  );
}
