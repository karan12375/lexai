import re
import json
from typing import List, Dict, Any, AsyncGenerator
from rag.vector_store import semantic_search
from services.kanoon import search_precedents, search_parallel
from services.groq_service import (
    stream_completion, complete,
    LEGAL_SYSTEM_PROMPT,
    build_counter_argument_prompt,
    build_verdict_prompt,
    build_draft_prompt,
)
import logging

logger = logging.getLogger(__name__)


# ─── Agent 1: Counter Argument Generator ──────────────────────────────────────

async def extract_arguments(text: str) -> List[str]:
    """Extract main legal arguments from petition/case text using LLM."""
    prompt = f"""Extract the main legal arguments from this document. Return ONLY a JSON array of strings.
Each string should be one distinct legal argument or claim.
Maximum 8 arguments. Be specific and concise.

Document:
{text[:3000]}

Return format: ["argument 1", "argument 2", ...]
Return ONLY the JSON array, nothing else."""

    result = await complete(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=512,
    )

    try:
        # Strip markdown fences if present
        clean = re.sub(r'```(?:json)?|```', '', result).strip()
        arguments = json.loads(clean)
        return arguments if isinstance(arguments, list) else []
    except Exception:
        # Fallback: split by newlines
        lines = [l.strip("- •1234567890.").strip() for l in result.split("\n") if l.strip()]
        return [l for l in lines if len(l) > 20][:8]


async def stream_counter_arguments(
    workspace_id: str,
    petition_text: str,
) -> AsyncGenerator[str, None]:
    """Full counter-argument generation pipeline with streaming."""

    yield "data: " + json.dumps({"stage": "Extracting arguments from petition...", "type": "stage"}) + "\n\n"

    arguments = await extract_arguments(petition_text)

    yield "data: " + json.dumps({"stage": f"Found {len(arguments)} arguments. Searching precedents...", "type": "stage"}) + "\n\n"

    # Search for opposing precedents
    search_queries = [f"counter argument {arg[:80]}" for arg in arguments[:3]]
    search_queries.append("defense strategy acquittal similar case India")

    kanoon_results = await search_parallel(search_queries, num_results=3)

    yield "data: " + json.dumps({"stage": "Retrieving relevant case documents...", "type": "stage"}) + "\n\n"

    # Get relevant chunks from workspace
    doc_chunks = semantic_search(workspace_id, " ".join(arguments[:3]), top_k=4)

    yield "data: " + json.dumps({"stage": "Building defense strategy...", "type": "stage"}) + "\n\n"

    prompt = build_counter_argument_prompt(petition_text, arguments, kanoon_results)

    yield "data: " + json.dumps({"type": "start"}) + "\n\n"

    async for token in stream_completion(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=LEGAL_SYSTEM_PROMPT,
        temperature=0.4,
        max_tokens=3000,
    ):
        yield "data: " + json.dumps({"token": token, "type": "token"}) + "\n\n"

    # Send citations
    citations = [
        {
            "title": r["title"],
            "court": r["court"],
            "date": r["date"],
            "url": r["url"],
            "citation": r["citation"],
            "type": "kanoon",
        }
        for r in kanoon_results[:6]
    ]
    yield "data: " + json.dumps({"citations": citations, "type": "citations"}) + "\n\n"
    yield "data: " + json.dumps({"type": "done"}) + "\n\n"


# ─── Agent 2: Verdict Predictor ───────────────────────────────────────────────

def _calculate_probability(case_texts: List[str]) -> Dict[str, Any]:
    """Calculate verdict probability from similar case texts."""
    guilty_keywords = ["convicted", "found guilty", "sentenced", "imprisonment", "penalty imposed", "accused convicted"]
    not_guilty_keywords = ["acquitted", "not guilty", "discharged", "case dismissed", "benefit of doubt", "charges dropped"]
    partial_keywords = ["partially allowed", "modified", "reduced sentence", "partial relief", "some charges"]

    guilty = 0
    not_guilty = 0
    partial = 0

    for text in case_texts:
        text_lower = text.lower()
        g = sum(1 for kw in guilty_keywords if kw in text_lower)
        ng = sum(1 for kw in not_guilty_keywords if kw in text_lower)
        p = sum(1 for kw in partial_keywords if kw in text_lower)

        if p > 0 and p >= g and p >= ng:
            partial += 1
        elif g > ng:
            guilty += 1
        elif ng > g:
            not_guilty += 1
        else:
            guilty += 0.5
            not_guilty += 0.5

    total = max(len(case_texts), 1)
    return {
        "guilty": round((guilty / total) * 100, 1),
        "not_guilty": round((not_guilty / total) * 100, 1),
        "partial_relief": round((partial / total) * 100, 1),
        "total_cases": len(case_texts),
    }


async def stream_verdict_prediction(
    workspace_id: str,
    case_facts: str,
) -> AsyncGenerator[str, None]:
    """Verdict prediction pipeline."""

    yield "data: " + json.dumps({"stage": "Analyzing case facts...", "type": "stage"}) + "\n\n"

    # Find similar cases in workspace
    similar_chunks = semantic_search(workspace_id, case_facts, top_k=10)

    yield "data: " + json.dumps({"stage": "Searching Indian Kanoon precedents...", "type": "stage"}) + "\n\n"

    kanoon_results = await search_precedents(
        f"verdict prediction {case_facts[:100]}",
        num_results=5,
        doc_type="judgment"
    )

    yield "data: " + json.dumps({"stage": "Calculating outcome probability...", "type": "stage"}) + "\n\n"

    # Calculate probability from similar cases
    all_texts = [c["text"] for c in similar_chunks] + [r["snippet"] for r in kanoon_results]
    probability = _calculate_probability(all_texts)

    yield "data: " + json.dumps({"probability": probability, "type": "probability"}) + "\n\n"
    yield "data: " + json.dumps({"stage": "Generating legal analysis...", "type": "stage"}) + "\n\n"
    yield "data: " + json.dumps({"type": "start"}) + "\n\n"

    prompt = build_verdict_prompt(case_facts, similar_chunks, probability)

    async for token in stream_completion(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=LEGAL_SYSTEM_PROMPT,
        temperature=0.3,
        max_tokens=2500,
    ):
        yield "data: " + json.dumps({"token": token, "type": "token"}) + "\n\n"

    citations = [
        {"title": r["title"], "court": r["court"], "url": r["url"], "citation": r["citation"], "type": "kanoon"}
        for r in kanoon_results
    ]
    yield "data: " + json.dumps({"citations": citations, "type": "citations"}) + "\n\n"
    yield "data: " + json.dumps({"type": "done"}) + "\n\n"


# ─── Agent 3: AI Document Drafter ─────────────────────────────────────────────

async def stream_draft_document(
    doc_type: str,
    details: Dict[str, str],
    workspace_id: str = None,
) -> AsyncGenerator[str, None]:
    """AI legal document drafting pipeline."""

    yield "data: " + json.dumps({"stage": "Loading legal template...", "type": "stage"}) + "\n\n"

    # Optionally enrich with workspace context
    if workspace_id:
        context_chunks = semantic_search(workspace_id, f"{doc_type} {' '.join(details.values())}", top_k=3)
        if context_chunks:
            details["_context"] = " ".join([c["text"][:200] for c in context_chunks[:2]])

    yield "data: " + json.dumps({"stage": "Drafting document with AI...", "type": "stage"}) + "\n\n"
    yield "data: " + json.dumps({"type": "start"}) + "\n\n"

    prompt = build_draft_prompt(doc_type, details)

    async for token in stream_completion(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=LEGAL_SYSTEM_PROMPT,
        temperature=0.2,
        max_tokens=3500,
    ):
        yield "data: " + json.dumps({"token": token, "type": "token"}) + "\n\n"

    yield "data: " + json.dumps({"type": "done"}) + "\n\n"


# ─── Agent 4: Legal Search ─────────────────────────────────────────────────────

async def stream_legal_search(
    workspace_id: str,
    query: str,
) -> AsyncGenerator[str, None]:
    """Semantic legal search combining workspace RAG + Indian Kanoon."""

    yield "data: " + json.dumps({"stage": "Searching your case documents...", "type": "stage"}) + "\n\n"

    doc_chunks = semantic_search(workspace_id, query, top_k=4)

    yield "data: " + json.dumps({"stage": "Searching Indian Kanoon database...", "type": "stage"}) + "\n\n"

    kanoon_results = await search_precedents(query, num_results=6)

    yield "data: " + json.dumps({"stage": "Synthesizing results...", "type": "stage"}) + "\n\n"

    doc_context = "\n\n".join([
        f"[{c['filename']}]: {c['text'][:400]}"
        for c in doc_chunks
    ]) if doc_chunks else "No relevant documents found in workspace."

    ik_context = "\n\n".join([
        f"[{r['title']} | {r['court']}]: {r['snippet']}"
        for r in kanoon_results
    ]) if kanoon_results else "No Indian Kanoon results found."

    search_prompt = f"""Legal search query: "{query}"

## From Uploaded Case Documents:
{doc_context}

## From Indian Kanoon (Legal Precedents):
{ik_context}

Provide a comprehensive legal answer:
1. Summary of relevant law/procedure
2. Key sections and articles that apply
3. Relevant case precedents
4. Practical guidance

Be concise but thorough. Cite all sources."""

    yield "data: " + json.dumps({"type": "start"}) + "\n\n"

    async for token in stream_completion(
        messages=[{"role": "user", "content": search_prompt}],
        system_prompt=LEGAL_SYSTEM_PROMPT,
        temperature=0.2,
        max_tokens=2000,
    ):
        yield "data: " + json.dumps({"token": token, "type": "token"}) + "\n\n"

    citations = [
        {"title": r["title"], "court": r["court"], "url": r["url"], "citation": r["citation"], "type": "kanoon"}
        for r in kanoon_results
    ]
    doc_citations = [
        {"title": c["filename"], "section": c.get("section", ""), "score": c["relevance_score"], "type": "document"}
        for c in doc_chunks
    ]
    yield "data: " + json.dumps({"citations": citations + doc_citations, "type": "citations"}) + "\n\n"
    yield "data: " + json.dumps({"type": "done"}) + "\n\n"
