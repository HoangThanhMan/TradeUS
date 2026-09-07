# Interview Prep — Trade-US

Seven short documents covering the whole system, written to be read in order the
night before an interview and skimmed again on the morning of.

| # | File | What it answers |
|---|---|---|
| 1 | [Overview](01-overview.md) | What is this, what did you build, what would you say in 30 seconds |
| 2 | [Architecture](02-architecture.md) | How the services fit together and why it is event-driven |
| 3 | [Real-time tier](03-realtime.md) | WebSockets, load balancing, and the numbers you measured |
| 4 | [Services and data](04-services.md) | Each service, auth, MongoDB, Redis |
| 5 | [AI components](05-ai.md) | Prediction, sentiment, the RAG agent, and what the evals actually said |
| 6 | [Quality](06-quality.md) | Tests, CI, and every real bug worth telling a story about |
| 7 | [Q&A](07-interview-qa.md) | Likely questions with answers, including the uncomfortable ones |

## How to use these

**The numbers in here are measured, not estimated.** Where a figure appears, the
document says how it was obtained so you can reproduce it if asked. If you cannot
reproduce a number, do not quote it.

**Know the weaknesses better than the strengths.** Sections 5 and 6 contain
results that did not work out — a model that loses to a coin flip, a fine-tune
that made things worse, a lint job that cannot gate. These are the strongest
material you have, because most candidates cannot discuss a negative result at
all. [Q&A](07-interview-qa.md) rehearses how to say them out loud.

**Claims this project should not make.** The system does not do sub-millisecond
trading, does not execute orders, has never served a real user, and its ML models
do not beat their baselines. Everything below stays inside those limits.
