/** IELTS topic bank (~40 themes) for content generation + anti-repetition. */
export const IELTS_TOPICS = [
  "Education", "Technology", "Environment", "Health", "Work & Careers",
  "Urban Life", "Transport", "Media & News", "Art & Culture", "Sport",
  "Food & Diet", "Travel & Tourism", "Family & Relationships", "Money & Consumerism",
  "Science & Research", "Crime & Justice", "Housing", "Aging Population",
  "Globalization", "Social Media", "Climate Change", "Renewable Energy",
  "Space Exploration", "Artificial Intelligence", "Mental Health",
  "Public Transport", "Childhood & Parenting", "Gender Equality",
  "Immigration", "Language Learning", "Wildlife Conservation",
  "Agriculture & Farming", "Fashion & Appearance", "Volunteering & Charity",
  "Leisure & Hobbies", "Advertising", "Privacy & Surveillance",
  "Elderly Care", "University vs Vocational Training", "Remote Work",
] as const;

/** Pick a topic preferring least-recently-seen. */
export function pickTopic(
  seen: { topic: string; count: number; lastSeen: number }[],
  random: () => number = Math.random,
): string {
  const counts = new Map(seen.map((s) => [s.topic, s.count]));
  const sorted = [...IELTS_TOPICS].sort(
    (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
  );
  // pick randomly among the 8 least-used topics
  const pool = sorted.slice(0, 8);
  return pool[Math.floor(random() * pool.length)];
}
