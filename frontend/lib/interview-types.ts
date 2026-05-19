export type InterviewQuestion = {
  id: string;
  skill: string;
  type: string;
  question: string;
  idealAnswer: string;
};

export type SkillInterviewPlan = {
  skill: string;
  questions: InterviewQuestion[];
};

export type InterviewPlanResponse = {
  plans: SkillInterviewPlan[];
};

export type AnswerMode = "voice" | "type";

export type QuestionResult = {
  questionId: string;
  userAnswer: string;
  mode: AnswerMode;
  points: number;
  maxPoints: number;
  submittedAt: string;
};
