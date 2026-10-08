# Grader calibration anchors

`anchor-essays.json` contains hand-checked essays with expected band scores.

When you switch LLM providers/models, re-grade the anchors (via the Writing
page or a script) and check the returned `overall` is within ±0.5 of
`expectedBand`. If a model is consistently generous or harsh, prefer another
model or tighten the grader prompt.
