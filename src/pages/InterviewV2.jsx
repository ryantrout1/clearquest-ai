import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/**
 * InterviewV2 - BACKWARD COMPATIBILITY REDIRECT
 * This page exists only for backward compatibility with old links/bookmarks.
 * All interview logic now lives in CandidateInterview (canonical page).
 * 
 * This redirect preserves URL parameters (e.g., ?session=xyz) so resume links work.
 */
export default function InterviewV2() {
  const navigate = useNavigate();

  useEffect(() => {
    // Preserve all URL parameters when redirecting
    const urlParams = window.location.search;
    navigate(createPageUrl("CandidateInterview") + urlParams, { replace: true });
  }, [navigate]);

  // Show nothing - redirect happens immediately
  return null;
}