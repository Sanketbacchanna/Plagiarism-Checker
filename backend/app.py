import io
import re
import numpy as np
import requests

from bs4 import BeautifulSoup
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from docx import Document
from pypdf import PdfReader

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from sentence_transformers import SentenceTransformer


app = FastAPI(title="ML Plagiarism Checker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


print("Loading Sentence Transformer model...")
model = SentenceTransformer("all-MiniLM-L6-v2")
print("ML model loaded successfully.")


MAX_SOURCE_CHARS = 25000
MAX_SEARCH_QUERIES = 6
MAX_RESULTS_PER_QUERY = 5


# =========================================================
# TEXT CLEANING
# =========================================================

def clean_text(text):
    text = re.sub(r"\s+", " ", text or "")
    return text.strip()


# =========================================================
# DOCUMENT EXTRACTION
# =========================================================

def extract_text(filename, content):

    filename = (filename or "").lower()

    if filename.endswith(".docx"):

        document = Document(
            io.BytesIO(content)
        )

        paragraphs = []

        for paragraph in document.paragraphs:

            text = paragraph.text.strip()

            if text:
                paragraphs.append(text)

        return "\n".join(paragraphs)


    if filename.endswith(".pdf"):

        pdf = PdfReader(
            io.BytesIO(content)
        )

        pages = []

        for page in pdf.pages:

            text = page.extract_text() or ""

            if text.strip():
                pages.append(text)

        return "\n".join(pages)


    if filename.endswith(".txt") or filename.endswith(".md"):

        return content.decode(
            "utf-8",
            errors="ignore"
        )


    raise ValueError(
        "Unsupported file type. Use DOCX, PDF, TXT or MD."
    )


# =========================================================
# SENTENCES
# =========================================================

def split_sentences(text):

    sentences = re.split(
        r"(?<=[.!?])\s+",
        text
    )

    return [
        s.strip()
        for s in sentences
        if len(s.strip()) >= 30
    ]


# =========================================================
# SIX WORD PHRASES
# =========================================================

def create_phrases(text, n=6):

    words = re.findall(
        r"\b\w+\b",
        text.lower()
    )

    if len(words) < n:
        return []

    return [
        " ".join(
            words[i:i+n]
        )
        for i in range(
            len(words) - n + 1
        )
    ]


# =========================================================
# EXACT PHRASE MATCHING
# =========================================================

def phrase_matching(
    document_text,
    source_text
):

    document_phrases = set(
        create_phrases(
            document_text,
            6
        )
    )

    source_phrases = set(
        create_phrases(
            source_text,
            6
        )
    )

    if not document_phrases:

        return 0.0, [], 0

    matched = sorted(
        document_phrases.intersection(
            source_phrases
        )
    )

    score = (
        len(matched) /
        len(document_phrases)
    ) * 100

    return (
        min(score, 100),
        matched[:20],
        len(matched)
    )


# =========================================================
# TF-IDF
# =========================================================

def tfidf_similarity(
    document_text,
    source_text
):

    try:

        vectorizer = TfidfVectorizer(
            stop_words="english",
            max_features=15000
        )

        vectors = vectorizer.fit_transform(
            [
                document_text,
                source_text
            ]
        )

        score = cosine_similarity(
            vectors[0:1],
            vectors[1:2]
        )[0][0]

        return float(
            score * 100
        )

    except Exception:

        return 0.0


# =========================================================
# CHUNK TEXT FOR ML
# =========================================================

def chunk_text(
    text,
    words_per_chunk=120
):

    words = text.split()

    chunks = []

    for i in range(
        0,
        len(words),
        words_per_chunk
    ):

        chunk = words[
            i:i + words_per_chunk
        ]

        if len(chunk) >= 20:

            chunks.append(
                " ".join(chunk)
            )

    return chunks


# =========================================================
# SENTENCE TRANSFORMER
# =========================================================

def semantic_similarity(
    document_text,
    source_text
):

    document_chunks = chunk_text(
        document_text
    )[:80]

    source_chunks = chunk_text(
        source_text
    )[:120]

    if (
        not document_chunks
        or not source_chunks
    ):

        return 0.0


    document_embeddings = model.encode(
        document_chunks,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False
    )


    source_embeddings = model.encode(
        source_chunks,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )


    matrix = np.matmul(
        document_embeddings,
        source_embeddings.T
    )

    matrix = np.clip(
        matrix,
        -1,
        1
    )


    best_matches = np.max(
        matrix,
        axis=1
    )

    best_matches = np.maximum(
        best_matches,
        0
    )


    # strongest 25% of document chunks
    k = max(
        1,
        int(
            np.ceil(
                len(best_matches) * 0.25
            )
        )
    )

    strongest = np.sort(
        best_matches
    )[-k:]


    score = (
        np.mean(strongest) * 100
    )

    return min(
        float(score),
        100
    )


# =========================================================
# WEB SEARCH
# =========================================================

def search_web(query):

    try:

        url = (
            "https://html.duckduckgo.com/html/"
        )

        headers = {
            "User-Agent":
                "Mozilla/5.0"
        }

        response = requests.post(
            url,
            data={
                "q": query
            },
            headers=headers,
            timeout=15
        )

        response.raise_for_status()

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        results = []

        for result in soup.select(
            ".result"
        )[:MAX_RESULTS_PER_QUERY]:

            link = result.select_one(
                ".result__a"
            )

            snippet = result.select_one(
                ".result__snippet"
            )

            if not link:
                continue


            results.append({

                "title":
                    link.get_text(
                        " ",
                        strip=True
                    ),

                "url":
                    link.get(
                        "href",
                        ""
                    ),

                "snippet":
                    snippet.get_text(
                        " ",
                        strip=True
                    )
                    if snippet
                    else ""
            })


        return results


    except Exception as error:

        print(
            "Web search error:",
            error
        )

        return []


# =========================================================
# SEARCH QUERY GENERATION
# =========================================================

def generate_queries(text):

    sentences = split_sentences(
        text
    )

    queries = []

    seen = set()


    for sentence in sentences:

        words = sentence.split()

        if len(words) < 8:
            continue


        query = " ".join(
            words[:18]
        )

        key = query.lower()


        if key not in seen:

            seen.add(key)

            queries.append(
                query
            )


        if len(queries) >= MAX_SEARCH_QUERIES:

            break


    return queries


# =========================================================
# FETCH WEBPAGE
# =========================================================

def fetch_webpage(url):

    try:

        if not url.startswith(
            (
                "http://",
                "https://"
            )
        ):

            return ""


        headers = {
            "User-Agent":
                "Mozilla/5.0"
        }


        response = requests.get(
            url,
            headers=headers,
            timeout=12
        )


        if response.status_code != 200:

            return ""


        content_type = (
            response
            .headers
            .get(
                "content-type",
                ""
            )
            .lower()
        )


        if "text/html" not in content_type:

            return ""


        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )


        for tag in soup([
            "script",
            "style",
            "nav",
            "footer",
            "header",
            "noscript"
        ]):

            tag.decompose()


        text = clean_text(
            soup.get_text(
                separator=" "
            )
        )


        return text[
            :MAX_SOURCE_CHARS
        ]


    except Exception as error:

        print(
            "Source fetch error:",
            error
        )

        return ""


# =========================================================
# FIND ONLINE SOURCES
# =========================================================

def find_sources(text):

    sources = {}


    for query in generate_queries(text):

        print(
            "Searching:",
            query
        )


        search_results = search_web(
            query
        )


        for result in search_results:

            url = result.get(
                "url",
                ""
            )


            if not url:
                continue


            if url in sources:
                continue


            source_text = fetch_webpage(
                url
            )


            if len(source_text) < 200:

                continue


            sources[url] = {

                "title":
                    result.get(
                        "title",
                        "Online Source"
                    ),

                "url":
                    url,

                "text":
                    source_text
            }


    return list(
        sources.values()
    )


# =========================================================
# ANALYZE SOURCE
# =========================================================

def analyze_source(
    document_text,
    source
):

    source_text = source["text"]


    tfidf_score = tfidf_similarity(
        document_text,
        source_text
    )


    semantic_score = semantic_similarity(
        document_text,
        source_text
    )


    phrase_score, matched_phrases, phrase_count = (
        phrase_matching(
            document_text,
            source_text
        )
    )


    # ML-heavy combined score
    final_score = (
        semantic_score * 0.55
        +
        tfidf_score * 0.20
        +
        phrase_score * 0.25
    )


    matched_words = (
        len(matched_phrases) * 6
    )


    return {

        "title":
            source["title"],

        "url":
            source["url"],

        "similarity":
            round(
                min(
                    final_score,
                    100
                ),
                2
            ),

        "semantic_similarity":
            round(
                semantic_score,
                2
            ),

        "tfidf_similarity":
            round(
                tfidf_score,
                2
            ),

        "phrase_similarity":
            round(
                phrase_score,
                2
            ),

        "matched_phrases":
            matched_phrases,

        "matched_phrase_count":
            phrase_count,

        "matched_words":
            matched_words
    }


# =========================================================
# MAIN PLAGIARISM API
# =========================================================

@app.post(
    "/api/check-plagiarism"
)
async def check_plagiarism(
    file: UploadFile = File(...)
):

    try:

        content = await file.read()


        text = clean_text(
            extract_text(
                file.filename or "",
                content
            )
        )


        if len(text) < 50:

            return {

                "success":
                    False,

                "error":
                    "Document contains insufficient text."
            }


        words = text.split()


        print(
            "Document words:",
            len(words)
        )


        # Search automatically
        sources = find_sources(
            text
        )


        results = []


        for source in sources:

            try:

                result = analyze_source(
                    text,
                    source
                )

                results.append(
                    result
                )

            except Exception as error:

                print(
                    "Source analysis error:",
                    error
                )


        results.sort(
            key=lambda x:
                x["similarity"],
            reverse=True
        )


        # Keep meaningful matches
        meaningful_results = [
            result
            for result in results
            if result["similarity"] >= 15
        ]


        top_results = (
            meaningful_results[:10]
        )


        if top_results:

            highest_score = (
                top_results[0]["similarity"]
            )

        else:

            highest_score = 0


        matched_phrases = sum(
            result.get(
                "matched_phrase_count",
                0
            )
            for result in top_results
        )


        matched_words = min(

            len(words),

            sum(
                result.get(
                    "matched_words",
                    0
                )
                for result in top_results
            )
        )


        # =================================================
        # STATUS
        # =================================================

        if highest_score >= 70:

            status = (
                "HIGH SIMILARITY"
            )

        elif highest_score >= 40:

            status = (
                "POTENTIAL PLAGIARISM"
            )

        elif highest_score >= 20:

            status = (
                "SOME SIMILARITY"
            )

        else:

            status = (
                "NO SIGNIFICANT MATCH"
            )


        return {

            "success":
                True,

            "filename":
                file.filename,

            "words_analyzed":
                len(words),

            "sources_checked":
                len(results),

            "matchedWords":
                matched_words,

            "matchedPhrases":
                matched_phrases,

            "similarity":
                highest_score,

            "status":
                status,

            "results":
                top_results
        }


    except Exception as error:

        print(
            "API error:",
            error
        )


        return {

            "success":
                False,

            "error":
                str(error)
        }


# =========================================================
# SERVER TEST
# =========================================================

@app.get("/")
def home():

    return {

        "message":
            "ML Plagiarism Checker API is running"
    }