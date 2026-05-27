from openai import AsyncOpenAI

from typing import (
    AsyncGenerator,
    List,
    Dict,
    Any,
    Optional
)

from config import get_settings

import logging


logger = logging.getLogger(__name__)

settings = get_settings()

_client: Optional[AsyncOpenAI] = None


# ─────────────────────────────────────────────
# GROQ CLIENT
# ─────────────────────────────────────────────

def get_groq_client() -> AsyncOpenAI:

    global _client

    if _client is None:

        _client = AsyncOpenAI(

            api_key=settings.groq_api_key,

            base_url=settings.groq_base_url,
        )

    return _client


# ─────────────────────────────────────────────
# STREAMING COMPLETION
# ─────────────────────────────────────────────

async def stream_completion(

    messages: List[Dict[str, str]],

    system_prompt: str = "",

    temperature: float = 0.3,

    max_tokens: int = 2048,

) -> AsyncGenerator[str, None]:

    """
    Stream tokens from Groq LLM.
    """

    client = get_groq_client()

    full_messages = []

    if system_prompt:

        full_messages.append({

            "role": "system",

            "content": system_prompt
        })

    full_messages.extend(messages)

    try:

        stream = await client.chat.completions.create(

            model=settings.model_name,

            messages=full_messages,

            temperature=temperature,

            max_tokens=max_tokens,

            stream=True,
        )

        async for chunk in stream:

            delta = chunk.choices[0].delta

            if delta.content:

                yield delta.content

    except Exception as e:

        logger.error(
            f"Groq streaming error: {e}"
        )

        yield f"\n\n[Error: {str(e)}]"


# ─────────────────────────────────────────────
# NORMAL COMPLETION
# ─────────────────────────────────────────────

async def complete(

    messages: List[Dict[str, str]],

    system_prompt: str = "",

    temperature: float = 0.2,

    max_tokens: int = 2048,

) -> str:

    """
    Non-streaming completion.
    """

    client = get_groq_client()

    full_messages = []

    if system_prompt:

        full_messages.append({

            "role": "system",

            "content": system_prompt
        })

    full_messages.extend(messages)

    try:

        response = await client.chat.completions.create(

            model=settings.model_name,

            messages=full_messages,

            temperature=temperature,

            max_tokens=max_tokens,

            stream=False,
        )

        return (
            response
            .choices[0]
            .message
            .content
            or ""
        )

    except Exception as e:

        logger.error(
            f"Groq completion error: {e}"
        )

        return f"Error: {str(e)}"


# ─────────────────────────────────────────────
# STRICT LEGAL SYSTEM PROMPT
# ─────────────────────────────────────────────

LEGAL_SYSTEM_PROMPT = """
You are LexAI, an advanced Indian legal AI assistant.

You are STRICTLY LIMITED to helping with:

- Indian law
- IPC
- CrPC
- Constitution of India
- Indian Evidence Act
- Civil Procedure Code (CPC)
- Bail applications
- FIR analysis
- Legal drafting
- Courtroom preparation
- Litigation strategy
- Legal research
- Indian Kanoon precedents
- Legal notices
- Affidavits
- Petitions
- Verdict analysis
- Legal document summarization
- Case law analysis

IMPORTANT RULES:

1. You are NOT general ChatGPT.

2. You MUST REFUSE unrelated requests including:
   - programming or coding
   - software engineering
   - React/Python/Javascript help
   - medical advice
   - finance advice
   - crypto/stocks
   - entertainment
   - gaming
   - relationship advice
   - politics
   - hacking
   - illegal activity
   - educational tutoring unrelated to law
   - general knowledge questions
   - casual conversation unrelated to legal matters

3. If user asks unrelated questions,
reply ONLY with:

"I am LexAI, a legal AI assistant designed exclusively for Indian legal research, drafting, case analysis, courtroom preparation, and litigation support. I cannot assist with unrelated topics."

4. Always maintain a professional legal-assistant tone.

5. Always prioritize:
   - Indian statutes
   - Indian case law
   - procedural law
   - courtroom strategy
   - precedent analysis

6. Always cite:
   - IPC/CrPC sections
   - Articles
   - Indian statutes
   - relevant judgments
when possible.

7. Never fabricate legal citations or fake precedents.

8. If legal information is uncertain,
clearly mention limitations.

9. Keep responses concise, structured, and legally focused.

10. If insufficient legal context exists,
ask clarifying legal questions.

11. Never provide emotional/personal advice.

12. Never answer non-legal casual conversation.

13. If user greets casually like "hi" or "hello",
respond briefly and redirect toward legal assistance.

14. Any generated legal draft, strategy, or legal conclusion must include a short note that final filing decisions require review by a licensed Indian advocate.

Example:
"Hello. I can assist you with Indian legal research, drafting, precedents, FIR analysis, IPC/CrPC guidance, and courtroom preparation. How may I help regarding your legal matter?"
"""


# ─────────────────────────────────────────────
# RAG PROMPT
# ─────────────────────────────────────────────

def build_rag_prompt(

    query: str,

    doc_chunks: List[Dict],

    kanoon_results: List[Dict],

    conversation_history:
    List[Dict] = None,

) -> List[Dict[str, str]]:

    """
    Build RAG prompt.
    """

    # DOCUMENT CONTEXT

    doc_context = ""

    if doc_chunks:

        doc_context = (
            "## Uploaded Case Documents\n\n"
        )

        for i, chunk in enumerate(
            doc_chunks,
            1
        ):

            doc_context += (

                f"[Doc {i}: "

                f"{chunk['filename']} "

                f"| "

                f"{chunk.get('section', '')}"

                f"]\n"

                f"{chunk['text']}\n\n"
            )


    # KANOON CONTEXT

    ik_context = ""

    if kanoon_results:

        ik_context = (
            "## Relevant Indian Legal "
            "Precedents "
            "(Indian Kanoon)\n\n"
        )

        for i, case in enumerate(
            kanoon_results,
            1
        ):

            ik_context += (

                f"[Precedent {i}: "

                f"{case['title']} "

                f"| "

                f"{case['court']} "

                f"| "

                f"{case['date']}]\n"

                f"{case['snippet']}\n"

                f"Source: "

                f"{case['url']}\n\n"
            )


    context = (
        doc_context
        + ik_context
    ).strip()


    user_content = f"""
Using the legal context below,
answer the query with precise
Indian legal analysis.

{context if context else "No additional legal context provided."}

---

Legal Query:
{query}

Requirements:

1. Direct legal answer
2. Relevant IPC/CrPC sections
3. Applicable legal provisions
4. Relevant precedents
5. Practical legal implications

Remain strictly within
Indian legal context.
"""


    messages = []

    if conversation_history:

        messages.extend(
            conversation_history[-6:]
        )

    messages.append({

        "role": "user",

        "content": user_content
    })

    return messages


# ─────────────────────────────────────────────
# COUNTER ARGUMENT PROMPT
# ─────────────────────────────────────────────

def build_counter_argument_prompt(

    petition_text: str,

    arguments: List[str],

    precedents: List[Dict]

) -> str:

    prec_text = "\n".join([

        f"- {p['title']} "

        f"({p['court']}, "

        f"{p['date']}): "

        f"{p['snippet']}"

        for p in precedents[:5]
    ])

    args_text = "\n".join([

        f"{i+1}. {arg}"

        for i, arg in enumerate(arguments)
    ])

    return f"""
You are a senior Indian defense advocate.

Analyze the following petition
and generate strong legal
counter-arguments.

## Petition Arguments:
{args_text}

## Supporting Precedents:
{prec_text}

## Petition Text:
{petition_text[:3000]}

Generate:

### Counter Arguments

### Defense Strategy

### Applicable IPC/CrPC Sections

### Supporting Case Law

### Risk Assessment

Remain strictly within
Indian legal framework.
"""


# ─────────────────────────────────────────────
# VERDICT PROMPT
# ─────────────────────────────────────────────

def build_verdict_prompt(

    case_facts: str,

    similar_cases: List[Dict],

    probability: Dict

) -> str:

    cases_text = "\n".join([

        f"- {c['filename']}: "

        f"{c['text'][:200]}..."

        for c in similar_cases[:5]
    ])

    return f"""
You are an expert Indian
legal analyst.

Predict likely legal outcome.

## Case Facts:
{case_facts[:2000]}

## Similar Cases:
{cases_text}

## Statistical Analysis:
Guilty probability:
{probability.get('guilty', 0):.1f}%

Not guilty probability:
{probability.get('not_guilty', 0):.1f}%

Provide:

1. Verdict prediction
2. Legal reasoning
3. Factors favoring prosecution
4. Factors favoring defense
5. Relevant precedents
6. Strategic recommendations

Use Indian legal standards only.
"""


# ─────────────────────────────────────────────
# DRAFT PROMPT
# ─────────────────────────────────────────────

def build_draft_prompt(

    doc_type: str,

    details: Dict[str, str]

) -> str:

    templates = {

        "petition":
        "Writ Petition",

        "notice":
        "Legal Notice",

        "affidavit":
        "Affidavit",

        "bail_application":
        "Bail Application",

        "complaint":
        "Criminal Complaint",

        "reply":
        "Reply to Legal Notice",

        "vakalatnama":
        "Vakalatnama",
    }

    doc_name = templates.get(

        doc_type,

        doc_type
        .replace("_", " ")
        .title()
    )

    details_text = "\n".join([

        f"{k}: {v}"

        for k, v in details.items()

        if v
    ])

    return f"""
Draft a professional
Indian legal document.

Document Type:
{doc_name}

## Details:
{details_text}

Requirements:

- Formal Indian legal format
- Proper legal structure
- Cause title
- Prayer clause
- Verification clause
- Court-ready drafting
- Proper paragraph numbering

Draft complete document now.
"""
