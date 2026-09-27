import io
import re
import requests
import numpy as np

from bs4 import BeautifulSoup
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from docx import Document
from pypdf import PdfReader

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from sentence_transformers import SentenceTransformer


# ---------------------------------------------------------
# APP
# ---------------------------------------------------------

app = FastAPI(title="ML Plagiarism Checker")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# LOAD ML MODEL
# ---------------------------------------------------------

print("Loading Sentence Transformer model...")

model = SentenceTransformer("all-MiniLM-L6-v2")

print("ML model loaded successfully.")


# ---------------------------------------------------------
# DOCUMENT TEXT EXTRACTION
# ---------------------------------------------------------

def extract_text(filename, content):

    filename = filename.lower()

    # DOCX
    if filename.endswith(".docx"):

        document = Document(io.BytesIO(content))

        paragraphs = []

        for paragraph in document.paragraphs:
            text = paragraph.text.strip()

            if text:
                paragraphs.append(text)

        return "\n".join(paragraphs)

    # PDF
    elif filename.endswith(".pdf"):

        pdf = PdfReader(io.BytesIO(content))

        pages = []

        for page in pdf.pages:

            text = page.extract_text()

            if text:
                pages.append(text)

        return "\n".join(pages)

    # TXT / MD
    elif filename.endswith(".txt") or filename.endswith(".md"):

        return content.decode("utf-8", errors="ignore")

    else:

        raise ValueError(
            "Unsupported file type. Use DOCX, PDF, TXT or MD."
        )


# ---------------------------------------------------------
# CLEAN TEXT
# ---------------------------------------------------------

def clean_text(text):

    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ---------------------------------------------------------
# SENTENCE SPLITTER
# ---------------------------------------------------------

def split_sentences(text):

    sentences = re.split(
        r"(?<=[.!?])\s+",
        text
    )

    sentences = [
        s.strip()
        for s in sentences
        if len(s.strip()) > 20
    ]

    return sentences


# ---------------------------------------------------------
# CREATE PHRASES
# ---------------------------------------------------------

def create_phrases(text, n=6):

    words = re.findall(
        r"\b[a-zA-Z0-9]+\b",
        text.lower()
    )

    phrases = []

    for i in range(len(words) - n + 1):

        phrase = " ".join(
            words[i:i+n]
        )

        phrases.append(phrase)

    return phrases


# ---------------------------------------------------------
# TF-IDF SIMILARITY
# ---------------------------------------------------------

def tfidf_similarity(document_text, source_text):

    try:

        vectorizer = TfidfVectorizer(
            stop_words="english"
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

        return float(score * 100)

    except Exception:

        return 0.0


# ---------------------------------------------------------
# SEMANTIC ML SIMILARITY
# ---------------------------------------------------------

def semantic_similarity(document_text, source_text):

    document_embedding = model.encode(
        document_text,
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    source_embedding = model.encode(
        source_text,
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    score = np.dot(
        document_embedding,
        source_embedding
    )

    score = max(0, min(1, float(score)))

    return score * 100


# ---------------------------------------------------------
# EXACT PHRASE MATCHING
# ---------------------------------------------------------

def phrase_matching(document_text, source_text):

    document_phrases = set(
        create_phrases(document_text)
    )

    source_phrases = set(
        create_phrases(source_text)
    )

    if not document_phrases:

        return 0, []

    matched = document_phrases.intersection(
        source_phrases
    )

    percentage = (
        len(matched) /
        len(document_phrases)
    ) * 100

    return percentage, list(matched)[:20]


# ---------------------------------------------------------
# FETCH WEBPAGE
# ---------------------------------------------------------

def fetch_webpage(url):

    try:

        headers = {
            "User-Agent":
            "Mozilla/5.0"
        }

        response = requests.get(
            url,
            headers=headers,
            timeout=10
        )

        if response.status_code != 200:
            return ""

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        # Remove unnecessary HTML
        for tag in soup([
            "script",
            "style",
            "nav",
            "footer",
            "header"
        ]):

            tag.decompose()

        text = soup.get_text(
            separator=" "
        )

        text = clean_text(text)

        return text[:100000]

    except Exception:

        return ""


# ---------------------------------------------------------
# SEARCH WEB
# ---------------------------------------------------------

def search_web(query):

    """
    Uses DuckDuckGo HTML search.

    For production use, replace this with
    an official search API.
    """

    try:

        url = "https://html.duckduckgo.com/html/"

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
            timeout=10
        )

        soup = BeautifulSoup(
            response.text,
            "html.parser"
        )

        results = []

        for result in soup.select(
            ".result"
        )[:5]:

            link = result.select_one(
                ".result__a"
            )

            snippet = result.select_one(
                ".result__snippet"
            )

            if link:

                title = link.get_text(
                    " ",
                    strip=True
                )

                href = link.get(
                    "href"
                )

                description = ""

                if snippet:
                    description = snippet.get_text(
                        " ",
                        strip=True
                    )

                results.append({
                    "title": title,
                    "url": href,
                    "snippet": description
                })

        return results

    except Exception as e:

        print("Search error:", e)

        return []


# ---------------------------------------------------------
# GENERATE SEARCH QUERIES
# ---------------------------------------------------------

def generate_queries(text):

    sentences = split_sentences(text)

    queries = []

    # Use distinctive sentences
    for sentence in sentences[:8]:

        words = sentence.split()

        if len(words) >= 8:

            query = " ".join(
                words[:18]
            )

            queries.append(query)

    return queries


# ---------------------------------------------------------
# FIND ONLINE SOURCES
# ---------------------------------------------------------

def find_sources(text):

    queries = generate_queries(text)

    sources = {}

    for query in queries:

        print(
            "Searching:",
            query
        )

        results = search_web(query)

        for result in results:

            url = result["url"]

            if url in sources:
                continue

            source_text = fetch_webpage(
                url
            )

            if len(source_text) < 100:
                continue

            sources[url] = {
                "title":
                    result["title"],

                "url":
                    url,

                "text":
                    source_text
            }

    return list(
        sources.values()
    )


# ---------------------------------------------------------
# ANALYZE SOURCE
# ---------------------------------------------------------

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

    phrase_score, matched_phrases = (
        phrase_matching(
            document_text,
            source_text
        )
    )

    # Hybrid ML score
    final_score = (
        tfidf_score * 0.25 +
        semantic_score * 0.50 +
        phrase_score * 0.25
    )

    return {

        "title":
            source["title"],

        "url":
            source["url"],

        "tfidf_similarity":
            round(tfidf_score, 2),

        "semantic_similarity":
            round(semantic_score, 2),

        "phrase_similarity":
            round(phrase_score, 2),

        "similarity":
            round(final_score, 2),

        "matched_phrases":
            matched_phrases
    }


# ---------------------------------------------------------
# MAIN API
# ---------------------------------------------------------

@app.post("/api/check-plagiarism")
async def check_plagiarism(
    file: UploadFile = File(...)
):

    try:

        content = await file.read()

        # Extract document
        text = extract_text(
            file.filename,
            content
        )

        text = clean_text(text)

        if len(text) < 50:

            return {
                "success": False,
                "error":
                    "Document contains insufficient text."
            }

        words = text.split()

        # Search Internet
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

                results.append(result)

            except Exception as e:

                print(
                    "Source analysis error:",
                    e
                )

        # Sort by similarity
        results.sort(
            key=lambda x:
                x["similarity"],
            reverse=True
        )

        # Top source
        highest_score = 0

        if results:

            highest_score = results[0][
                "similarity"
            ]

        # ------------------------------------------------
        # STATUS
        # ------------------------------------------------

        if highest_score >= 70:

            status = "HIGH SIMILARITY"

        elif highest_score >= 40:

            status = "POTENTIAL PLAGIARISM"

        elif highest_score >= 20:

            status = "SOME SIMILARITY"

        else:

            status = "NO SIGNIFICANT MATCH"

        return {

            "success": True,

            "filename":
                file.filename,

            "words_analyzed":
                len(words),

            "sources_checked":
                len(results),

            "similarity":
                highest_score,

            "status":
                status,

            "results":
                results[:10]

        }

    except Exception as e:

        return {

            "success": False,

            "error":
                str(e)

        }


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/")
def home():

    return {
        "message":
            "ML Plagiarism Checker API is running"
    }