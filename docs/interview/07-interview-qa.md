# 7. Questions and answers

Rehearse the answers in the last two sections especially. Comfort with a negative
result is rare and reads as senior.

## Architecture

**Why RabbitMQ and not just HTTP between services?**
One producer, several unrelated consumers. With HTTP the collector would need to
know every consumer's address and handle each one's failures; with a topic
exchange it publishes once and never learns who listens. Adding a consumer is a
queue binding, not a change to the publisher. It also isolates failure — a
gateway crash does not stop ingestion — and gives backpressure somewhere to go.

**Why RabbitMQ and not Kafka?**
Volumes here are ~118 msg/s, and nothing needs replay or long retention. Rabbit's
routing model fits the "one event, several different consumers with different
filters" shape directly, and it is far lighter to operate. Kafka would win if we
needed replayable history or partitioned ordering at much higher throughput.

**Why a topic exchange rather than fanout?**
Consumers want subsets. Routing keys are `price.<symbol>`, so a future consumer
can bind `price.btcusdt` and receive one symbol. Fanout would force every consumer
to receive everything and filter in application code.

**Why do both gateways get every message instead of sharing the load?**
Because they serve *different* clients. If they shared one queue, RabbitMQ would
round-robin and each update would reach only half the users. Load is shared at the
connection layer by Nginx, not at the message layer.

**Why `ip_hash`?**
Subscription state lives in gateway memory, so a client must keep reaching the
same gateway. `ip_hash` achieves that with no shared session store. The cost is
that users behind one NAT concentrate on one gateway, and a gateway restart drops
its clients' subscriptions. The proper fix is stateless gateways — subscriptions
in Redis plus the Socket.IO Redis adapter — which was not built.

**How would you scale to 10,000 clients?**
Measure first: 1,000 was where testing stopped, not where it broke. Then make the
gateways stateless so they can scale horizontally and lose an instance without
dropping subscriptions, and switch away from `ip_hash`. Ingest is not the
bottleneck — it is ~118 msg/s — so scaling is about fan-out, not intake.

## Real-time and performance

**What is your p99 and what does it measure?**
13 ms at 1,000 concurrent clients, measured from gateway emit to client receipt.
It does not include the path from Binance, because the payload does not carry the
exchange's event time. To measure end-to-end I would stamp Binance's event time in
the collector and carry it through.

**How do you know the system kept up?**
Queue backlog stayed at 0 throughout. If consumers had fallen behind, messages
would have accumulated in their queues — that is the number to watch, more than
throughput.

**What happens if a gateway dies?**
Its queue holds messages until it returns, so nothing is lost at the broker. But
its connected clients lose their subscriptions, because that state is in memory.
Socket.IO reconnects them and Nginx may route them elsewhere, where they must
re-subscribe. That is the main weakness of the design.

## Data

**Why MongoDB?**
The documents are naturally nested — an article with its score, emotion and
provenance is one document — and the schema changed constantly. Honestly, `users`
is relational-shaped and Postgres would have served it just as well; Mongo was one
decision applied to everything rather than the right choice per collection.

**How is Redis used?**
Alert cooldown. When an alert fires, `SETEX alert:cooldown:<user>:<symbol>` with a
TTL, and any alert finding that key is skipped. Expiry *is* the feature — no
scheduler, no cleanup. It is not a general cache in this system.

## AI

**Does the price prediction model work?**
No, and I can tell you exactly how I know. It calls direction correctly 49.1% of
the time against a 50.9% majority-class floor, on the same 4,995 test bars the
training notebook used — I reproduced its stored RMSE to four decimals before
trusting anything else. Low RMSE looked fine until I added a naive baseline, and
predicting zero scores slightly better. The harness also found a 100x feature
scaling mismatch between training and serving, which is now pinned by a test.

**Then why is it still in the product?**
Because it is a coursework demo of a serving pipeline, not investment advice, and
the README says the model has no demonstrated edge. If this were a real product
the signal would come out until it beat a baseline.

**Tell me about the fine-tuning.**
A LoRA adapter, 0.36% of 82M parameters, two heads — MSE on the score,
CrossEntropy on emotion. It scored 58% against the untrained checkpoint's 66% on
a held-out hand-labelled set, so training made the model 8 points *worse*. The
cause was label provenance: the API key was suspended before the training set was
exported, so the labels came from a keyword fallback and the student learned to
imitate a regex. I did not deploy it. The legitimate finding was the control I
ran alongside it — the untrained public checkpoint beats the paid API on this
data, 66% vs 56%, at a fifth of the latency and no marginal cost.

**Is your chat agent real RAG or a wrapper?**
Real retrieval: 227 article embeddings in Qdrant, top-k, and the answer cites
headlines that are verbatim payload values from the index. Real function calling:
three tools, a loop capped at three rounds, tools within a round running
concurrently. What has never run is the Gemini call at the top of the loop,
because the key is suspended — so the demo runs through a deterministic planner
that drives the identical execution path and says in its output that no model
wrote it.

## The uncomfortable ones

**What would you do differently?**
Make the gateways stateless from the start. Everything awkward downstream —
`ip_hash`, subscriptions lost on restart, the ceiling on scaling — traces back to
putting client state in gateway memory.

**What is the weakest part of this system?**
Operational visibility. There are health endpoints but no metrics, no tracing and
no alerting, and I have direct evidence that matters: the collector stalled for
minutes during a load test while its health endpoint still reported connected. I
found it by watching broker throughput, which is not a strategy that scales.

**Is any of this production-ready?**
No, and I would not claim it. There is no observability stack, backends trust the
gateway implicitly, seven of eleven services have no CI, and there are no
integration tests. It is a system I can defend architecturally and have measured
honestly, not one I would put in front of users.

**What did you actually learn?**
That measurement changes decisions. Two models looked fine until I put a baseline
next to them, and both turned out to be worse than doing nothing — one worse than
predicting zero, one worse than not training at all. Neither shipped. I would
rather present that than a number I could not defend.
