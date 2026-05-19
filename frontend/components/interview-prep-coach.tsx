"use client";

import type {
  AnswerMode,
  InterviewQuestion,
  QuestionResult,
  SkillInterviewPlan,
} from "@/lib/interview-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type InterviewPrepCoachProps = {
  gapSkills: string[];
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getSpeechRecognition(): BrowserSpeechRecognition | null {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function InterviewPrepCoach({ gapSkills }: InterviewPrepCoachProps) {
  const [plans, setPlans] = useState<SkillInterviewPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [mode, setMode] = useState<AnswerMode>("voice");
  const [answerText, setAnswerText] = useState("");
  const [livePreview, setLivePreview] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<QuestionResult | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const skillsKey = useMemo(() => gapSkills.join("|"), [gapSkills]);

  useEffect(() => {
    if (gapSkills.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (!cancelled) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const response = await fetch("/api/interview/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gapSkills }),
        });
        const data = (await response.json()) as {
          plans?: SkillInterviewPlan[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load questions");
        }
        if (!cancelled) {
          setPlans(data.plans ?? []);
          setActiveSkill(data.plans?.[0]?.skill ?? "");
          setQuestionIndex(0);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load questions");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skillsKey, gapSkills]);

  const activePlan = plans.find((p) => p.skill === activeSkill) ?? plans[0];
  const questions = activePlan?.questions ?? [];
  const currentQuestion: InterviewQuestion | undefined =
    questions[questionIndex];

  const resetQuestionState = useCallback(() => {
    setAnswerText("");
    setLivePreview("");
    setSubmitted(null);
    setRecordError(null);
  }, []);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const part = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalText += part;
        } else {
          interim += part;
        }
      }
      if (finalText) {
        setAnswerText((prev) => `${prev} ${finalText}`.trim());
      }
      setLivePreview(interim);
    };
    recognition.onerror = () => {
      // Browser speech preview is optional; Whisper is the source of truth.
    };
    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setRecordError(null);
    try {
      const body = new FormData();
      body.set("audio", blob, "answer.webm");
      const response = await fetch("/api/interview/transcribe", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Transcription failed");
      }
      const whisperText = (data.text ?? "").trim();
      if (whisperText) {
        setAnswerText(whisperText);
      }
      setLivePreview("");
    } catch (e) {
      setRecordError(
        e instanceof Error ? e.message : "Whisper transcription failed",
      );
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopRecognition();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }, [stopRecognition]);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    setLivePreview("");
    if (!answerText) {
      setAnswerText("");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          void transcribeBlob(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      startRecognition();
    } catch {
      setRecordError("Microphone access denied or unavailable.");
    }
  }, [answerText, startRecognition, transcribeBlob]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion) {
      return;
    }
    const trimmed = answerText.trim();
    if (!trimmed) {
      setRecordError("Add an answer by speaking or typing first.");
      return;
    }

    setSubmitBusy(true);
    setRecordError(null);
    try {
      const response = await fetch("/api/interview/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAnswer: trimmed,
          idealAnswer: currentQuestion.idealAnswer,
          mode,
        }),
      });
      const data = (await response.json()) as {
        points?: number;
        maxPoints?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Scoring failed");
      }
      setSubmitted({
        questionId: currentQuestion.id,
        userAnswer: trimmed,
        mode,
        points: data.points ?? 0,
        maxPoints: data.maxPoints ?? 0,
        submittedAt: new Date().toISOString(),
      });
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setSubmitBusy(false);
    }
  };

  const selectSkill = (skill: string) => {
    setActiveSkill(skill);
    setQuestionIndex(0);
    resetQuestionState();
  };

  const goNextQuestion = () => {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((i) => i + 1);
      resetQuestionState();
    }
  };

  if (gapSkills.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-900/50 bg-gradient-to-br from-zinc-900 via-zinc-900 to-violet-950/30">
      <div className="border-b border-zinc-800/80 px-6 py-4">
        <h2 className="text-lg font-semibold text-zinc-100">
          AI Interview Prep Coach
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Practice gap skills with likely interview questions.{" "}
          <span className="text-violet-300">
            Voice answers earn more points
          </span>{" "}
          (Whisper transcription).
        </p>
      </div>

      {loading ? (
        <p className="px-6 py-8 text-sm text-zinc-500">Generating questions…</p>
      ) : null}
      {loadError ? (
        <p className="px-6 py-4 text-sm text-red-400">{loadError}</p>
      ) : null}

      {!loading && plans.length > 0 ? (
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button
                key={plan.skill}
                type="button"
                onClick={() => selectSkill(plan.skill)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeSkill === plan.skill
                    ? "border-violet-500 bg-violet-500/20 text-violet-200"
                    : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {plan.skill}
              </button>
            ))}
          </div>

          {currentQuestion ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <span>
                  Question {questionIndex + 1} of {questions.length}
                </span>
                <div className="flex rounded-lg border border-zinc-700 p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("voice")}
                    className={`rounded-md px-3 py-1 text-xs ${
                      mode === "voice"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400"
                    }`}
                  >
                    Talk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isRecording) {
                        stopRecording();
                      }
                      setMode("type");
                    }}
                    className={`rounded-md px-3 py-1 text-xs ${
                      mode === "type"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400"
                    }`}
                  >
                    Type
                  </button>
                </div>
              </div>

              <p className="text-base font-medium leading-relaxed text-zinc-100">
                {currentQuestion.question}
              </p>

              {mode === "voice" ? (
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isTranscribing}
                    className={`flex h-20 w-20 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                      isRecording
                        ? "animate-pulse border-red-400 bg-red-500/20 text-red-200"
                        : "border-violet-500 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
                    } disabled:opacity-50`}
                  >
                    {isTranscribing
                      ? "…"
                      : isRecording
                        ? "Stop"
                        : "Speak"}
                  </button>
                  <p className="text-xs text-zinc-500">
                    {isRecording
                      ? "Listening… release Stop when finished"
                      : isTranscribing
                        ? "Transcribing with Whisper…"
                        : "Tap Speak and answer out loud"}
                  </p>
                </div>
              ) : null}

              <div className="mt-4">
                <label className="mb-2 block text-xs uppercase tracking-wide text-zinc-500">
                  Your answer {mode === "voice" ? "(from voice)" : ""}
                </label>
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  readOnly={mode === "voice" && (isRecording || isTranscribing)}
                  placeholder={
                    mode === "voice"
                      ? "Your words will appear here after you speak…"
                      : "Type your answer…"
                  }
                  rows={5}
                  className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
                />
                {livePreview ? (
                  <p className="mt-2 text-xs italic text-violet-300/80">
                    Live: {livePreview}
                  </p>
                ) : null}
              </div>

              {recordError ? (
                <p className="mt-2 text-xs text-red-400">{recordError}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitAnswer()}
                  disabled={submitBusy || !answerText.trim() || submitted !== null}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                >
                  {submitBusy ? "Scoring…" : "Submit answer"}
                </button>
                {submitted && questionIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNextQuestion}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Next question
                  </button>
                ) : null}
              </div>

              {submitted ? (
                <div className="mt-5 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
                  <p className="text-sm font-medium text-emerald-300">
                    +{submitted.points} / {submitted.maxPoints} pts
                    {submitted.mode === "voice" ? " (voice bonus)" : ""}
                  </p>
                  <div>
                    <p className="mb-1 text-xs uppercase text-zinc-500">
                      Ideal answer
                    </p>
                    <p className="text-sm leading-relaxed text-zinc-300">
                      {currentQuestion.idealAnswer}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
