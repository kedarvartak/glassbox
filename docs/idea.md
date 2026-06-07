# Idea

## The problem

When you use a coding agent, its context window is a black box. You cannot see
what is resident in it, where each piece came from, or what it costs. Over a long
session the window fills with garbage: content that refers to something gone,
stale, or already spent. You pay to re-ingest that garbage on every turn, because
cached context is billed at the cache-read rate each time the agent replies.

Measured across 57 real Claude Code sessions (each at least 150 KB), 59.5% of all
resident context tokens were provably reclaimable garbage. That is more than half
the window, re-sent on every single turn.

## The insight

Not all garbage is the same, and most of it can be identified by proof rather than
guesswork. A file read whose file was later deleted is gone. A file read four
times has three dead copies. A byte-identical block is a duplicate. These are
facts you can check against the filesystem and against the transcript itself — no
judgement required.

That matters because the usual fix, compaction, is lossy: it summarizes the whole
window and silently drops detail, which is why model accuracy often drops after a
compact. If garbage can be identified by proof, it can be removed without touching
anything the model still needs.

## The solution

Glassbox is a local-first, read-only inspector for agent context. It parses a
session transcript, reconstructs what is resident in the window, and classifies
every segment. It then offers one cleanup action: a lossless fork.

The fork writes a new copy of the transcript with the provable garbage replaced by
short tombstones, leaving every message and tool-call pair intact. Your original
session is never modified. You resume from the cleaned copy and the garbage is
gone, with no loss of anything the model actually needs.

The design is deliberately narrow. Detection is wide and honest; the only thing
Glassbox ever writes is a new sibling session, and it refuses to write one that
would not load. See [architecture.md](architecture.md) for how it is built and
[usage.md](usage.md) for how to run it.
