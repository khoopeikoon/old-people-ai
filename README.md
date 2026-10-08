# Ask Your Kid

It's to make old people less reliant on their kids.

A simple web page where an older person types (or says) the question they'd normally ask their son or daughter, like *"How do I make the writing bigger on my phone?"*. Claude answers, and they pick how they want help:

- **Show me, one step at a time.** One small step on screen, in big text, with what they should see when it worked. They tap **Done, next step** when ready, can go **Back**, have it **read aloud**, or tap **I'm stuck** to get that one step explained again more simply.
- **Look it up on Google.** Opens Google in a new tab with a well-worded search already typed in.

Built for older eyes and hands: large text with an A−/A+ control, high contrast (and a dark mode), big tap targets, plain language, no jargon. If a question looks like a scam (gift cards, "your computer has a virus" calls, someone asking for passwords) it shows a calm warning first.

## Running it

Needs Node 20+ and a [Claude API key](https://platform.claude.com/).

```sh
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Then open http://localhost:3000.

| Setting | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Your Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Which Claude model answers |
| `PORT` | `3000` | Port the server listens on |

Without a key the page still loads, and if asking fails it offers the Google search instead.

## How it's built

- `server.js`: a tiny Node server (no framework) that serves `public/` and two endpoints:
  - `POST /api/ask` `{ question }` → `{ title, intro, steps[], searchQuery, googleUrl, warning }`
  - `POST /api/stuck` `{ question, steps, stepIndex, problem? }` → `{ reply, smallerSteps[] }`
- `lib/helper.js`: the Claude prompt and JSON schemas. Uses structured outputs so the page always gets well-formed steps.
- `public/`: plain HTML, CSS and JS. Voice input uses the browser's speech recognition where available (Chrome, Edge, Safari); read-aloud uses the browser's built-in voice.

`npm test` runs the small unit tests.
