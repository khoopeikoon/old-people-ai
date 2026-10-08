// Talks to Claude on behalf of the person asking. Two jobs:
//   askForHelp()   – turn a question into a Google search + a step-by-step walkthrough
//   helpWithStep() – the person is stuck on one step; explain it again, more simply

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the patient, kind grown-up child of an older person. They are asking you how to do something, usually with a phone, computer, tablet, TV, app, website or other everyday technology, but it could be anything.

Write the way a loving son or daughter would explain it at the kitchen table:
- Plain, everyday words. No jargon. If you must name a button or menu, say what it looks like and where it is ("the little gear picture, usually in the top right corner").
- One small action per step. Never combine two actions in one step.
- Short sentences. Each step is at most three sentences.
- Assume nothing is already open or set up. Start from where they most likely are (for example, holding the phone on the home screen).
- If the answer depends on their device (iPhone vs Android, Windows vs Mac), pick the most common case, say which one you picked in the intro, and mention briefly how to tell.
- Be warm and reassuring, never condescending. It's fine to say "this part is a bit fiddly, take your time."
- If the request looks like a scam (gift cards, someone asking for passwords or bank details, "remote access" from a stranger, urgent payment demands), put a clear, calm warning in "warning" and make the steps about staying safe.
- If it's about health, money or legal matters, give practical steps but suggest checking with a doctor, bank or professional where it matters.

Also write a short Google search query (the words a savvy person would type) that would find a good answer for their exact situation.`;

// Structured output schema: guarantees we get back something the page can render.
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "steps", "searchQuery", "warning"],
  properties: {
    title: {
      type: "string",
      description: "Short, friendly restatement of what they want to do, e.g. 'Making the text bigger on your iPhone'.",
    },
    intro: {
      type: "string",
      description: "One or two reassuring sentences before the steps, including any assumption about their device.",
    },
    steps: {
      type: "array",
      description: "The walkthrough, one small action per step. Usually 3 to 10 steps.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["instruction", "whatYouShouldSee"],
        properties: {
          instruction: { type: "string", description: "What to do, in plain words." },
          whatYouShouldSee: {
            type: "string",
            description: "What the screen or thing should look like after doing it, so they know it worked. Empty string if not useful.",
          },
        },
      },
    },
    searchQuery: { type: "string", description: "A good Google search query for this question." },
    warning: {
      type: "string",
      description: "A calm safety warning if this looks like a scam or something risky. Empty string otherwise.",
    },
  },
};

const STUCK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "smallerSteps"],
  properties: {
    reply: {
      type: "string",
      description: "A short, warm reply that addresses what went wrong and explains the step again more simply.",
    },
    smallerSteps: {
      type: "array",
      description: "If helpful, the stuck step broken into even smaller actions. Empty if not needed.",
      items: { type: "string" },
    },
  },
};

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new HelperError(
      "The helper isn't set up yet: no Claude API key was found (set ANTHROPIC_API_KEY).",
      503,
    );
  }
  client ??= new Anthropic();
  return client;
}

export class HelperError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

async function callClaude({ system, user, schema, maxTokens }) {
  let response;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // Short, everyday questions: low effort keeps answers quick for someone waiting.
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      // If a safety classifier declines, let the API retry on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new HelperError("The helper isn't set up properly (the Claude API key was rejected).", 503);
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      throw new HelperError("The helper is very busy right now. Please wait a minute and try again.", 503);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new HelperError("I couldn't reach the helper. Please check the internet and try again.", 503);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new HelperError("Sorry, I can't help with that one. Try asking it a different way.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new HelperError("That answer got too long. Try asking a smaller part of the question.", 502);
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new HelperError("Something went wrong reading the answer. Please try again.", 502);
  }
}

export function cleanQuestion(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 2000);
}

export function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function askForHelp(question) {
  const answer = await callClaude({
    system: SYSTEM_PROMPT,
    user: `My question: ${question}`,
    schema: ANSWER_SCHEMA,
    maxTokens: 8000,
  });
  return { ...answer, googleUrl: googleSearchUrl(answer.searchQuery || question) };
}

export async function helpWithStep({ question, steps, stepIndex, problem }) {
  const list = steps
    .map((s, i) => `${i + 1}. ${s.instruction}${s.whatYouShouldSee ? ` (You should see: ${s.whatYouShouldSee})` : ""}`)
    .join("\n");
  const user = [
    `My original question: ${question}`,
    `The steps you gave me:\n${list}`,
    `I'm stuck on step ${stepIndex + 1}.`,
    problem ? `What's happening: ${problem}` : "I didn't say what's wrong; just explain this step again more simply.",
  ].join("\n\n");

  return callClaude({ system: SYSTEM_PROMPT, user, schema: STUCK_SCHEMA, maxTokens: 4000 });
}
