import React from "react";
import ContentContainer from "@/components/interview/ContentContainer";

/**
 * TranscriptCards - Dumb presentational components for transcript entry rendering
 * No hooks, no side effects, no API calls - just renders JSX from props
 */

/**
 * V3OpenerHistoryCard - Renders opener history entries in transcript
 */
export function V3OpenerHistoryCard({ entryKey, stableKey, categoryLabel, instanceNumber, text, exampleNarrative }) {
  const instanceTitle = categoryLabel && instanceNumber > 1
    ? `${categoryLabel} — Instance ${instanceNumber}`
    : categoryLabel;

  return (
    <div key={entryKey} data-stablekey={stableKey}>
      <ContentContainer>
        <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
          {categoryLabel && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-purple-400">{instanceTitle}</span>
            </div>
          )}
          <p className="text-white text-sm leading-relaxed">{text}</p>
          {exampleNarrative && (
            <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
              <p className="text-slate-300 text-xs italic">{exampleNarrative}</p>
            </div>
          )}
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * V3ProbeQuestionCard - Renders V3 probe question entries in transcript
 */
export function V3ProbeQuestionCard({ entryKey, text }) {
  return (
    <div key={entryKey}>
      <ContentContainer>
        <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
          </div>
          <p className="text-white text-sm leading-relaxed">{text}</p>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * V3ProbeAnswerCard - Renders V3 probe answer entries in transcript
 */
export function V3ProbeAnswerCard({ entryKey, text }) {
  return (
    <div key={entryKey} style={{ marginBottom: 10 }}>
      <ContentContainer>
        <div className="flex justify-end">
          <div className="bg-purple-600 rounded-xl px-5 py-3 max-w-[85%]">
            <p className="text-white text-sm">{text}</p>
          </div>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * UserAnswerCard - Renders user answer bubbles in transcript
 */
export function UserAnswerCard({ entryKey, stableKey, text, style }) {
  return (
    <div key={entryKey} style={style || { marginBottom: 10 }} data-stablekey={stableKey}>
      <ContentContainer>
        <div className="flex justify-end">
          <div className="bg-blue-600 rounded-xl px-5 py-3 max-w-[85%]">
            <p className="text-white text-sm">{text}</p>
          </div>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * AssistantMessageCard - Renders assistant message entries in transcript
 */
export function AssistantMessageCard({ entryKey, stableKey, text }) {
  return (
    <div key={entryKey} data-stablekey={stableKey}>
      <ContentContainer>
        <div className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * QuestionShownCard - Renders base question entries in transcript (non-active)
 */
export function QuestionShownCard({
  entryKey,
  stableKey,
  questionNumber,
  sectionName,
  questionText,
  isActive = false,
  activeLaneCardRef,
  scrollMarginBottomPx
}) {
  const ringClass = isActive
    ? "ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20"
    : "";

  return (
    <div
      key={entryKey}
      ref={isActive ? activeLaneCardRef : undefined}
      data-stablekey={stableKey}
      data-cq-active-card={isActive ? "true" : undefined}
      data-ui-contract-card={isActive ? "true" : undefined}
      style={isActive && scrollMarginBottomPx ? { scrollMarginBottom: `${scrollMarginBottomPx}px` } : undefined}
    >
      <ContentContainer>
        <div className={`w-full bg-[#1a2744] border border-slate-700/60 rounded-xl p-5 transition-all duration-150 ${ringClass}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base font-semibold text-blue-400">
              Question {questionNumber || ''}
            </span>
            {sectionName && (
              <>
                <span className="text-sm text-slate-500">•</span>
                <span className="text-sm font-medium text-slate-300">{sectionName}</span>
              </>
            )}
          </div>
          <p className="text-white text-base leading-relaxed">{questionText}</p>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * ActiveV3ProbeCard - Renders the active V3 probe question card with ring highlight
 */
export function ActiveV3ProbeCard({ entryKey, stableKey, text, instanceNumber }) {
  return (
    <div key={entryKey} data-stablekey={stableKey} data-cq-active-card="true" data-ui-contract-card="true">
      <ContentContainer>
        <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-purple-400">AI Follow-Up</span>
            {instanceNumber > 1 && (
              <>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">Instance {instanceNumber}</span>
              </>
            )}
          </div>
          <p className="text-white text-sm leading-relaxed">{text}</p>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * ActiveV3OpenerCard - Renders the active V3 opener card with ring highlight
 */
export function ActiveV3OpenerCard({
  entryKey,
  stableKey,
  categoryLabel,
  instanceNumber,
  text,
  exampleNarrative
}) {
  const instanceTitle = categoryLabel && instanceNumber > 1
    ? `${categoryLabel} — Instance ${instanceNumber}`
    : categoryLabel;

  return (
    <div key={entryKey} data-stablekey={stableKey} data-cq-active-card="true" data-ui-contract-card="true">
      <ContentContainer>
        <div className="w-full bg-purple-900/30 border border-purple-700/50 rounded-xl p-4 ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20 transition-all duration-150">
          {categoryLabel && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-purple-400">{instanceTitle}</span>
            </div>
          )}
          <p className="text-white text-sm leading-relaxed">{text}</p>
          {exampleNarrative && (
            <div className="mt-3 bg-slate-800/50 border border-slate-600/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1 font-medium">Example:</p>
              <p className="text-slate-300 text-xs italic">{exampleNarrative}</p>
            </div>
          )}
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * MiGateCard - Renders multi-instance gate prompt card
 */
export function MiGateCard({
  entryKey,
  stableKey,
  categoryLabel,
  instanceNumber
}) {
  const nextInstanceNum = (instanceNumber || 1) + 1;
  const gatePromptText = `You've completed ${categoryLabel || 'this section'}. Would you like to report another instance?`;

  return (
    <div key={entryKey} data-stablekey={stableKey} data-cq-active-card="true" data-ui-contract-card="true">
      <ContentContainer>
        <div className="w-full bg-amber-900/30 border border-amber-700/50 rounded-xl p-4 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/20 transition-all duration-150">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-amber-400">
              {categoryLabel} — Instance {nextInstanceNum}?
            </span>
          </div>
          <p className="text-white text-sm leading-relaxed">{gatePromptText}</p>
        </div>
      </ContentContainer>
    </div>
  );
}

/**
 * RequiredAnchorFallbackCard - Renders the required anchor fallback prompt card
 */
export function RequiredAnchorFallbackCard({
  entryKey,
  questionText
}) {
  return (
    <div key={entryKey} data-cq-active-card="true" data-ui-contract-card="true">
      <ContentContainer>
        <div className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20 transition-all duration-150">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-blue-400">Required Information</span>
          </div>
          <p className="text-white text-sm leading-relaxed">{questionText}</p>
        </div>
      </ContentContainer>
    </div>
  );
}