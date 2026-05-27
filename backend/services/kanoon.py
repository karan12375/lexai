import httpx
import asyncio
from typing import List, Dict, Any, Optional
from config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

KANOON_BASE = "https://api.indiankanoon.org"
KANOON_SEARCH = f"{KANOON_BASE}/search/"
KANOON_DOC = f"{KANOON_BASE}/doc/"


async def search_precedents(
    query: str,
    num_results: int = 5,
    doc_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search Indian Kanoon for relevant judgments and legal documents.
    """

    if not settings.indian_kanoon_api_key:
        logger.warning(
            "Indian Kanoon API key not configured"
        )
        return _mock_kanoon_results(query)

    params = {
        "formInput": query,
        "pagenum": 0,
    }

    if doc_type:
        params["doctype"] = doc_type

    headers = {
        "Authorization": f"Token {settings.indian_kanoon_api_key}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:

            # FINAL FIX → POST request
            response = await client.post(
                KANOON_SEARCH,
                data=params,
                headers=headers
            )

            logger.info(
                f"Indian Kanoon Status: "
                f"{response.status_code}"
            )

            response.raise_for_status()

            data = response.json()

        results = []

        for item in data.get("docs", [])[:num_results]:

            results.append({
                "title": item.get("title", "Unknown Case"),
                "court": item.get("docsource", "Unknown Court"),
                "date": item.get("publishdate", ""),
                "doc_id": str(item.get("tid", "")),
                "url": (
                    f"https://indiankanoon.org/doc/"
                    f"{item.get('tid', '')}"
                ),
                "snippet": _clean_snippet(
                    item.get("headline", "")
                ),
                "doc_type": item.get(
                    "doctype",
                    "judgment"
                ),
                "citation": _format_citation(item),
            })

        logger.info(
            f"Indian Kanoon returned "
            f"{len(results)} results"
        )

        return results

    except httpx.TimeoutException:
        logger.error("Indian Kanoon API timeout")

        return _mock_kanoon_results(query)

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Indian Kanoon HTTP error: "
            f"{e.response.status_code} - "
            f"{e.response.text}"
        )

        return _mock_kanoon_results(query)

    except Exception as e:
        logger.error(
            f"Indian Kanoon API error: {e}"
        )

        return _mock_kanoon_results(query)


async def get_document(
    doc_id: str
) -> Optional[Dict[str, Any]]:
    """
    Fetch full document from Indian Kanoon.
    """

    if not settings.indian_kanoon_api_key:
        return None

    headers = {
        "Authorization": (
            f"Token "
            f"{settings.indian_kanoon_api_key}"
        ),
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:

            response = await client.get(
                f"{KANOON_DOC}{doc_id}/",
                headers=headers
            )

            response.raise_for_status()

            data = response.json()

        return {
            "doc_id": doc_id,
            "title": data.get("title", ""),
            "content": data.get("doc", ""),
            "url": (
                f"https://indiankanoon.org/doc/"
                f"{doc_id}"
            ),
        }

    except Exception as e:
        logger.error(
            f"Error fetching IK document "
            f"{doc_id}: {e}"
        )

        return None


async def search_parallel(
    queries: List[str],
    num_results: int = 3
) -> List[Dict]:
    """
    Run multiple Indian Kanoon searches in parallel.
    """

    tasks = [
        search_precedents(q, num_results)
        for q in queries
    ]

    results_list = await asyncio.gather(
        *tasks,
        return_exceptions=True
    )

    all_results = []
    seen_ids = set()

    for results in results_list:

        if isinstance(results, list):

            for r in results:

                if r["doc_id"] not in seen_ids:
                    seen_ids.add(r["doc_id"])
                    all_results.append(r)

    return all_results


def _clean_snippet(snippet: str) -> str:
    """
    Remove HTML tags from snippet.
    """

    import re

    clean = re.sub(r'<[^>]+>', '', snippet)

    return clean.strip()[:400]


def _format_citation(item: Dict) -> str:
    """
    Format Indian legal citation.
    """

    title = item.get("title", "Unknown")
    court = item.get("docsource", "")
    date = item.get("publishdate", "")
    tid = item.get("tid", "")

    parts = [title]

    if court:
        parts.append(court)

    if date:
        parts.append(
            f"({date[:4]})"
            if len(date) >= 4
            else date
        )

    if tid:
        parts.append(f"[IK Doc {tid}]")

    return ", ".join(parts)


def _mock_kanoon_results(
    query: str
) -> List[Dict]:
    """
    Mock fallback results.
    """

    return [
        {
            "title": (
                f"Sample Case Related to: "
                f"{query[:50]}"
            ),
            "court": "Supreme Court of India",
            "date": "2023-01-15",
            "doc_id": "mock_001",
            "url": (
                "https://indiankanoon.org/"
                "doc/mock_001"
            ),
            "snippet": (
                "Indian Kanoon API unavailable. "
                "Showing fallback result."
            ),
            "doc_type": "judgment",
            "citation": (
                "Mock Case, Supreme Court "
                "of India (2023)"
            ),
        }
    ]