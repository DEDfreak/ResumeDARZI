"""
Analyze the base resume's editable bullets to extract a writing style profile.
This fingerprint is passed to Gemini as a constraint.
"""

import re
from collections import Counter


# Common past-tense action verbs in resumes
COMMON_VERBS = {
    "built", "developed", "designed", "implemented", "created", "managed",
    "led", "optimized", "reduced", "improved", "deployed", "automated",
    "established", "architected", "integrated", "migrated", "refactored",
    "maintained", "collaborated", "delivered", "launched", "scaled",
    "engineered", "configured", "streamlined", "analyzed", "resolved",
    "coordinated", "mentored", "contributed", "increased", "decreased",
    "wrote", "tested", "debugged", "monitored", "enhanced", "secured",
}


def extract_fingerprint(bullets: list[str]) -> dict:
    """
    Analyze bullet texts and return a style fingerprint dict.
    """
    if not bullets:
        return {
            "avg_word_count": 15,
            "verb_tense": "past",
            "top_verbs": [],
            "avg_complexity": "simple",
            "comma_frequency": 0.5,
            "uses_metrics": False,
            "summary": "No bullets to analyze — use standard professional resume style.",
        }

    word_counts = []
    verbs = []
    comma_counts = []
    metric_count = 0

    for bullet in bullets:
        # Clean LaTeX commands
        clean = re.sub(r'\\[a-zA-Z]+\{([^}]*)\}', r'\1', bullet)
        clean = re.sub(r'[\\{}]', '', clean).strip()

        words = clean.split()
        word_counts.append(len(words))

        # Extract leading verb
        if words:
            first_word = words[0].lower().rstrip(',.:;')
            verbs.append(first_word)

        # Count commas
        comma_counts.append(clean.count(','))

        # Check for metrics (numbers, percentages, dollar signs)
        if re.search(r'\d+[%$]|\$\d|[\d,]+\+?\s*(users|requests|ms|seconds|hours|clients|customers|transactions)', clean, re.IGNORECASE):
            metric_count += 1
        elif re.search(r'\b\d{2,}\b', clean):
            metric_count += 1

    avg_words = sum(word_counts) / len(word_counts)
    avg_commas = sum(comma_counts) / len(comma_counts)

    # Determine verb tense
    past_tense_count = sum(1 for v in verbs if v.endswith('ed') or v in COMMON_VERBS)
    verb_tense = "past" if past_tense_count > len(verbs) * 0.5 else "mixed"

    # Top verbs (most used)
    verb_counter = Counter(verbs)
    top_verbs = [v for v, _ in verb_counter.most_common(10)]

    # Complexity: simple if avg words < 20 and avg commas < 2
    complexity = "simple" if avg_words < 20 and avg_commas < 2 else "compound"

    uses_metrics = metric_count > len(bullets) * 0.3

    summary = (
        f"Average {avg_words:.0f} words per bullet. "
        f"{'Past tense' if verb_tense == 'past' else 'Mixed tense'} action verbs. "
        f"{'Frequently includes metrics/numbers' if uses_metrics else 'Rarely uses specific metrics'}. "
        f"{'Simple, direct sentences' if complexity == 'simple' else 'Compound sentences with multiple clauses'}. "
        f"Average {avg_commas:.1f} commas per bullet."
    )

    return {
        "avg_word_count": round(avg_words),
        "verb_tense": verb_tense,
        "top_verbs": top_verbs,
        "avg_complexity": complexity,
        "comma_frequency": round(avg_commas, 1),
        "uses_metrics": uses_metrics,
        "summary": summary,
    }
