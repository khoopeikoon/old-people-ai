"use strict";

const $ = (id) => document.getElementById(id);

const EXAMPLES = [
  "How do I make the writing bigger on my phone?",
  "How do I video call my grandkids on WhatsApp?",
  "How do I send a photo in a text message?",
  "Someone called saying my computer has a virus. What do I do?",
  "How do I watch Netflix on my TV?",
  "How do I stop my phone from ringing at night?",
];

const state = {
  question: "",
  answer: null, // { title, intro, steps, searchQuery, googleUrl, warning }
  step: 0,
};

// ---------- screens ----------
const SCREENS = ["ask", "loading", "choose", "step", "done", "error"];
function show(name) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  $("home-button").hidden = name === "ask";
  stopSpeaking();
  window.scrollTo({ top: 0 });
  // Move focus to the new screen's heading so screen readers announce it.
  const heading = $(`screen-${name}`).querySelector("h1, .step-card, .lead");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

function googleUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// ---------- ask ----------
async function ask(question) {
  state.question = question.trim();
  if (!state.question) {
    $("question").focus();
    return;
  }
  show("loading");
  try {
    state.answer = await post("/api/ask", { question: state.question });
    renderChoices();
    show("choose");
  } catch (err) {
    $("error-message").textContent = err.message;
    $("error-google").href = googleUrl(state.question);
    show("error");
  }
}

function renderChoices() {
  const a = state.answer;
  $("answer-title").textContent = a.title;
  $("answer-intro").textContent = a.intro;
  $("answer-warning").hidden = !a.warning;
  $("answer-warning").textContent = a.warning || "";
  $("steps-count").textContent = `${a.steps.length} small steps. I'll wait for you after each one.`;
  for (const id of ["choose-google", "done-google"]) $(id).href = a.googleUrl;
}

// ---------- steps ----------
function renderStep() {
  const { steps } = state.answer;
  const i = state.step;
  const step = steps[i];
  $("step-label").textContent = `Step ${i + 1} of ${steps.length}`;
  $("progress-bar").style.width = `${((i + 1) / steps.length) * 100}%`;
  $("step-instruction").textContent = step.instruction;
  $("step-see").hidden = !step.whatYouShouldSee;
  $("step-see").textContent = step.whatYouShouldSee || "";
  $("prev-step").disabled = i === 0;
  $("prev-step").style.visibility = i === 0 ? "hidden" : "visible";
  $("next-step").textContent = i === steps.length - 1 ? "Done, I finished! ✓" : "Done, next step →";
  $("stuck-answer").hidden = true;
  $("stuck-answer").replaceChildren();
  $("stuck-form").hidden = true;
  $("stuck-button").hidden = false;
}

function startSteps() {
  state.step = 0;
  show("step");
  renderStep();
}

function nextStep() {
  if (state.step < state.answer.steps.length - 1) {
    state.step++;
    stopSpeaking();
    renderStep();
    $("step-card").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    show("done");
  }
}

function prevStep() {
  if (state.step > 0) {
    state.step--;
    stopSpeaking();
    renderStep();
    $("step-card").focus();
  }
}

async function getUnstuck(event) {
  event.preventDefault();
  const box = $("stuck-answer");
  const submit = $("stuck-form").querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "Thinking…";
  try {
    const help = await post("/api/stuck", {
      question: state.question,
      steps: state.answer.steps,
      stepIndex: state.step,
      problem: $("stuck-problem").value,
    });
    const p = document.createElement("p");
    p.textContent = help.reply;
    box.replaceChildren(p);
    if (help.smallerSteps?.length) {
      const ol = document.createElement("ol");
      for (const s of help.smallerSteps) {
        const li = document.createElement("li");
        li.textContent = s;
        ol.append(li);
      }
      box.append(ol);
    }
    box.hidden = false;
    $("stuck-form").hidden = true;
    $("stuck-button").hidden = false;
    $("stuck-problem").value = "";
  } catch (err) {
    box.replaceChildren(Object.assign(document.createElement("p"), { textContent: err.message }));
    box.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Help me with this step";
  }
}

// ---------- reading aloud ----------
function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function readAloud() {
  if (!("speechSynthesis" in window)) return;
  stopSpeaking();
  const step = state.answer.steps[state.step];
  const extra = $("stuck-answer").hidden ? "" : ` ${$("stuck-answer").textContent}`;
  const text = `Step ${state.step + 1}. ${step.instruction} ${step.whatYouShouldSee ? `You should see: ${step.whatYouShouldSee}` : ""}${extra}`;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// ---------- speaking the question ----------
function setUpMicrophone() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;
  const button = $("mic-button");
  button.hidden = false;
  let listening = false;
  let recognition;
  button.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      $("question").value = Array.from(e.results, (r) => r[0].transcript).join(" ");
    };
    recognition.onend = () => {
      listening = false;
      button.textContent = "🎤 Say it out loud";
    };
    recognition.start();
    listening = true;
    button.textContent = "⏹ I'm done talking";
  });
}

// ---------- text size ----------
const SIZE_KEY = "askyourkid.textsize";
function setTextSize(px) {
  const size = Math.min(34, Math.max(16, px));
  document.documentElement.style.fontSize = `${size}px`;
  try { localStorage.setItem(SIZE_KEY, String(size)); } catch {}
}
function currentTextSize() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize);
}

// ---------- wire up ----------
function init() {
  try {
    const saved = Number(localStorage.getItem(SIZE_KEY));
    if (saved) setTextSize(saved);
  } catch {}
  $("bigger-text").addEventListener("click", () => setTextSize(currentTextSize() + 2));
  $("smaller-text").addEventListener("click", () => setTextSize(currentTextSize() - 2));

  for (const example of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = example;
    b.addEventListener("click", () => {
      $("question").value = example;
      ask(example);
    });
    $("examples").append(b);
  }

  $("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    ask($("question").value);
  });
  // Enter sends; Shift+Enter makes a new line.
  $("question").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask($("question").value);
    }
  });

  $("home-button").addEventListener("click", () => {
    $("question").value = "";
    show("ask");
  });
  $("ask-another").addEventListener("click", () => {
    $("question").value = "";
    show("ask");
  });
  $("choose-steps").addEventListener("click", startSteps);
  $("restart-steps").addEventListener("click", startSteps);
  $("next-step").addEventListener("click", nextStep);
  $("prev-step").addEventListener("click", prevStep);
  $("read-aloud").addEventListener("click", readAloud);
  if (!("speechSynthesis" in window)) $("read-aloud").hidden = true;
  $("stuck-button").addEventListener("click", () => {
    $("stuck-form").hidden = false;
    $("stuck-button").hidden = true;
    $("stuck-problem").focus();
  });
  $("stuck-cancel").addEventListener("click", () => {
    $("stuck-form").hidden = true;
    $("stuck-button").hidden = false;
  });
  $("stuck-form").addEventListener("submit", getUnstuck);
  $("error-retry").addEventListener("click", () => ask(state.question));

  setUpMicrophone();
  show("ask");
  $("question").focus();
}

init();
