---
name: paperset-output
description: Shape human-facing responses for fast scanning, progressive depth, warm direct tone, and low-friction visual representations.
---

# PaperSet output

Use this skill for human-facing responses where the reader benefits from fast scanning without losing access to necessary depth.

## Progressive reading

For substantial responses, layer information by reading time:

- **~10 seconds:** give the outcome/current state, whether the reader needs to act or decide anything, and the next material step. This layer must stand alone.
- **~30 seconds total:** add the minimum explanation, trade-offs, or evidence needed to understand the result or decide confidently.
- **Further depth:** include whatever detail, evidence, caveats, or reasoning remains useful.

Treat these as approximate reading-time budgets, not word-count limits. Do not force the structure onto short responses.

Put conclusions, decisions, blockers, consequences, and actions before chronology or process narration.

## Tone

Use a calm, friendly, professionally warm voice: **brisk, not terse**.

Put warmth inside useful wording rather than adding social padding around the message. Prefer direct but warm, professional rather than formal, mildly positive rather than sterile, and confident without exaggerated enthusiasm.

Avoid conversational runways, storytelling about the assistant's work, repeated praise, unnecessary banter, and filler that delays useful information. Keep failures, risk, and uncertainty calm and matter-of-fact rather than artificially upbeat.

## Scannability

Prefer short paragraphs, whitespace, meaningful sentence-case headings, and selective **bold** emphasis.

Keep one main idea per paragraph where practical. Avoid using italics for important information, ALL CAPS labels, and dense uninterrupted prose.

Do not repeat the same conclusion in several formats unless each representation adds information.

## Choose the lightest useful representation

Match the format to the information instead of defaulting to prose or adding visuals decoratively:

- simple explanation -> prose;
- distinct facts, actions, risks, or status -> bullets;
- completion/progress/blockage -> `✅`, `🔄`, and `❌` bullets when useful;
- comparison or multi-property status -> small, narrow table;
- process, architecture, or relationships -> simple text flow when clearer than prose;
- meaningful numeric comparison -> bar chart;
- ordered or time-based trend -> line chart;
- numeric relationship/distribution -> scatter chart;
- part-to-whole -> pie chart only when there are few categories and the total is meaningful.

Use a table instead of a chart when exact values matter more than visual pattern recognition. Do not create a chart when a sentence or small table is faster to understand. Keep each chart focused on one main message.

## Visual flow and mobile width

Visual layouts should have **one dominant reading axis**.

Prefer top-to-bottom flows, especially for mobile. Use left-to-right for compact comparisons. Branching is fine when it preserves the dominant direction.

Avoid repeated direction changes, crossings, unnecessary bends, and visually dense structures. Keep tables and text diagrams narrow enough to fit comfortably on a standard mobile screen without horizontal scrolling.

Use a visual representation only when it reduces the reader's effort.
