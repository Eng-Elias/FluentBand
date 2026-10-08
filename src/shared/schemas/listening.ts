import { z } from "zod";

export const speakerTurnSchema = z.object({
  speaker: z.string().describe("speaker label, e.g. 'Narrator', 'Anna', 'Tutor'"),
  text: z.string(),
});

const formCompletionQ = z.object({
  type: z.literal("form_completion"),
  question: z.string().describe("note/form line with a ____ gap"),
  answer: z.string(),
});

const listenMcqQ = z.object({
  type: z.literal("mcq"),
  question: z.string(),
  options: z.array(z.string()).min(3).max(4),
  answer: z.string(),
});

const listenMatchingQ = z.object({
  type: z.literal("matching"),
  question: z.string(),
  options: z.array(z.string()).min(2),
  answer: z.string(),
});

export const listeningQuestionSchema = z.discriminatedUnion("type", [
  formCompletionQ,
  listenMcqQ,
  listenMatchingQ,
]);

export const listeningScriptSchema = z.object({
  title: z.string(),
  section: z.number().int().min(1).max(4),
  topic: z.string(),
  speakers: z.array(z.string()).min(1).max(3),
  script: z.array(speakerTurnSchema).min(6),
  questions: z.array(listeningQuestionSchema).min(6).max(12),
});

export type SpeakerTurn = z.infer<typeof speakerTurnSchema>;
export type ListeningQuestion = z.infer<typeof listeningQuestionSchema>;
export type ListeningScript = z.infer<typeof listeningScriptSchema>;
